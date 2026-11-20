/**
 * scripts/send-tele-trends.mjs
 * 
 * Aggregates:
 * 1. Social Media viral drama / TikTok / Facebook / Threads hotspots (Kenh14 Star / Đời sống / Xã hội)
 * 2. Breaking search trends in Vietnam (Google Trends VN)
 * 
 * STRICT DEDUPLICATION:
 * - Checks both normalized URL and normalized Title against .trends_cache.json.
 * - NEVER re-sends items that were already pushed.
 * - If no new items are found in a 30-minute interval, it skips sending to avoid spamming the user.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_FILE = path.join(ROOT, '.trends_cache.json');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Error: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in .env');
  process.exit(1);
}

// ─── Deduplication Cache ───────────────────────────────────────────────────────
function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  return rawUrl.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
}

function normalizeTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      return {
        sentUrls: Array.isArray(parsed.sentUrls) ? parsed.sentUrls : [],
        sentTitles: Array.isArray(parsed.sentTitles) ? parsed.sentTitles : [],
      };
    }
  } catch (e) {}
  return { sentUrls: [], sentTitles: [] };
}

function saveCache(cache) {
  try {
    const cleanCache = {
      sentUrls: cache.sentUrls.slice(-500),
      sentTitles: cache.sentTitles.slice(-500),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cleanCache, null, 2));
  } catch (e) {
    console.error('Failed to save cache:', e.message);
  }
}

function isDuplicate(item, cache) {
  const normU = normalizeUrl(item.url);
  const normT = normalizeTitle(item.title || item.newsTitle || item.keyword);
  
  if (normU && cache.sentUrls.some(u => normalizeUrl(u) === normU)) {
    return true;
  }
  if (normT && cache.sentTitles.some(t => t === normT || (t.length > 20 && normT.includes(t)) || (normT.length > 20 && t.includes(normT)))) {
    return true;
  }
  return false;
}

function markAsSent(item, cache) {
  const normU = normalizeUrl(item.url);
  const normT = normalizeTitle(item.title || item.newsTitle || item.keyword);
  if (normU && !cache.sentUrls.includes(normU)) cache.sentUrls.push(normU);
  if (normT && !cache.sentTitles.includes(normT)) cache.sentTitles.push(normT);
}

// ─── Network & Scrapers ────────────────────────────────────────────────────────
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });

    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        family: 4,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) resolve(parsed);
            else reject(new Error(parsed.description || 'Telegram API Error'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram API request timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function fetchXml(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function fetchSocialTrends() {
  const [starXml, doiSongXml, xaHoiXml] = await Promise.all([
    fetchXml('https://kenh14.vn/rss/star.rss'),
    fetchXml('https://kenh14.vn/rss/doi-song.rss'),
    fetchXml('https://kenh14.vn/rss/xa-hoi.rss'),
  ]);

  const items = [];
  const parseItems = (xml, tag) => {
    const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/g;
    let match;
    let count = 0;
    while ((match = regex.exec(xml)) !== null && count < 8) {
      const rawDesc = match[3].replace(/<[^>]+>/g, '').trim();
      items.push({
        type: tag,
        title: match[1].trim(),
        url: match[2].trim(),
        desc: rawDesc.slice(0, 140),
      });
      count++;
    }
  };

  parseItems(starXml, '🎭 Showbiz / Drama');
  parseItems(doiSongXml, '📱 TikTok / MXH Hot');
  parseItems(xaHoiXml, '🚨 Xã Hội / Thời Sự Nóng');
  return items;
}

async function fetchGoogleTrends() {
  const data = await fetchXml('https://trends.google.com/trending/rss?geo=VN');
  const items = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<ht:approx_traffic>(.*?)<\/ht:approx_traffic>[\s\S]*?<ht:news_item_title>(.*?)<\/ht:news_item_title>[\s\S]*?<ht:news_item_url>(.*?)<\/ht:news_item_url>[\s\S]*?<ht:news_item_source>(.*?)<\/ht:news_item_source>/g;
  let match;
  let count = 0;
  while ((match = regex.exec(data)) !== null && count < 8) {
    items.push({
      keyword: match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
      traffic: match[2].trim(),
      newsTitle: match[3].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
      url: match[4].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
      source: match[5].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
    });
    count++;
  }
  return items;
}

export async function runScan(forceSend = false) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  console.log(`[${timeStr}] 🔍 Đang quét xu hướng mới (chống trùng lặp tuyệt đối)...`);

  const [socialItems, googleItems] = await Promise.all([
    fetchSocialTrends(),
    fetchGoogleTrends(),
  ]);

  const cache = loadCache();

  // Strict deduplication against sent URLs and Titles
  const freshSocial = socialItems.filter(s => !isDuplicate(s, cache));
  const freshGoogle = googleItems.filter(g => !isDuplicate(g, cache));

  let listSocial = freshSocial.slice(0, 3);
  let listGoogle = freshGoogle.slice(0, 3);

  if (listSocial.length === 0 && listGoogle.length === 0) {
    if (!forceSend) {
      console.log(`ℹ️ [${timeStr}] Không có tin mới so với các lần gửi trước. Bỏ qua, KHÔNG gửi tin trùng.`);
      return false;
    } else {
      console.log('⚠️ [Force] Tất cả tin hiện tại đã được gửi gần đây, lấy top xu hướng nóng nhất.');
      listSocial = socialItems.slice(0, 3);
      listGoogle = googleItems.slice(0, 3);
    }
  }

  let msg = `🔥 <b>BẢN TIN SĂN TREND TIKTOK, FACEBOOK & TIN NÓNG MỚI NHẤT</b>\n`;
  msg += `⏰ <i>Cập nhật: ${timeStr}</i>\n\n`;

  if (listSocial.length > 0) {
    msg += `📱 <b>DRAMA & XU HƯỚNG MẠNG XÃ HỘI (TIKTOK / FB / THREADS):</b>\n\n`;
    listSocial.forEach((item, idx) => {
      msg += `<b>${idx + 1}. [${item.type}]</b>\n`;
      msg += `👉 <b>${item.title}</b>\n`;
      if (item.desc) msg += `💬 <i>${item.desc}</i>\n`;
      msg += `🔗 <b>Link bài báo (chạm để copy):</b>\n<code>${item.url}</code>\n`;
      msg += `📋 <b>Nội dung tóm tắt (chạm để copy):</b>\n<code>${item.title}. ${item.desc || ''}</code>\n\n`;
      markAsSent(item, cache);
    });
  }

  if (listGoogle.length > 0) {
    msg += `⚡ <b>TIN NÓNG TÌM KIẾM BÙNG NỔ TRONG NƯỚC:</b>\n\n`;
    listGoogle.forEach((item, idx) => {
      msg += `<b>${idx + 1}. ${item.keyword.toUpperCase()}</b> (Tìm kiếm: <code>${item.traffic}</code>)\n`;
      msg += `📰 <b>Sự kiện:</b> ${item.newsTitle}\n`;
      msg += `📌 <b>Nguồn:</b> ${item.source}\n`;
      msg += `🔗 <b>Link bài báo (chạm để copy):</b>\n<code>${item.url}</code>\n`;
      msg += `📋 <b>Nội dung tóm tắt (chạm để copy):</b>\n<code>${item.newsTitle} (Theo ${item.source})</code>\n\n`;
      markAsSent(item, cache);
    });
  }

  msg += `🎬 <b>CÁCH TẠO VIDEO TRÊN ĐIỆN THOẠI:</b>\n`;
  msg += `• <b>Cách 1:</b> Chạm vào <b>Link bài báo</b> ở trên để copy rồi gửi vào bot.\n`;
  msg += `• <b>Cách 2:</b> Chạm vào <b>Nội dung tóm tắt</b> ở trên để copy rồi dán gửi vào bot (AI tự làm video cực chuẩn mà không lo link báo bị lỗi!).`;

  console.log(`📤 Đang gửi ${listSocial.length} tin MXH mới và ${listGoogle.length} xu hướng tìm kiếm mới về Telegram...`);
  try {
    await sendTelegram(msg);
    saveCache(cache);
    console.log('✅ Đã bắn các tin mới về Telegram thành công!');
    return true;
  } catch (err) {
    console.error('❌ Gửi Telegram thất bại:', err.message);
    return false;
  }
}

// Single execution or forced
const force = process.argv.includes('--force');
runScan(force);
