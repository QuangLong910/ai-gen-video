/**
 * scripts/tele-bot-service.mjs
 *
 * Dịch vụ Telegram Bot 2 chiều cho kênh Hóng Hớt 24/7:
 * 1. Tự động săn & đẩy tin hot định kỳ mỗi 30 phút về Telegram (sử dụng send-tele-trends.mjs).
 * 2. Lắng nghe tin nhắn từ người dùng qua Telegram Long Polling:
 *    - Gửi link bài báo hoặc lệnh /gen-video <link> -> Tự động tạo và gửi ngược video .mp4 về Telegram!
 *    - Lệnh /trend hoặc /tin -> Quét và gửi ngay tin hot mới nhất.
 *    - Lệnh /status -> Kiểm tra tình trạng hoạt động của hệ thống.
 *    - Lệnh /help hoặc /start -> Hướng dẫn chi tiết cách dùng.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { execSync, spawn } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { runScan } from './send-tele-trends.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load Environment ────────────────────────────────────────────────────────
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Lỗi: TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa được cấu hình trong .env');
  process.exit(1);
}

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ─── Telegram API Helpers ───────────────────────────────────────────────────
async function callTelegram(method, bodyObj) {
  const payload = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 35000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) resolve(parsed.result);
            else reject(new Error(parsed.description || 'Telegram API Error'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram request timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendMessage(text, replyToId = null) {
  try {
    const payload = {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };
    if (replyToId) payload.reply_to_message_id = replyToId;
    return await callTelegram('sendMessage', payload);
  } catch (err) {
    console.error('❌ sendMessage error:', err.message);
  }
}

async function sendChatAction(action = 'typing') {
  try {
    await callTelegram('sendChatAction', { chat_id: CHAT_ID, action });
  } catch (e) {}
}

async function sendVideo(videoPath, caption, replyToId = null) {
  if (!fs.existsSync(videoPath)) throw new Error('File video không tồn tại: ' + videoPath);

  const buffer = fs.readFileSync(videoPath);
  const blob = new Blob([buffer], { type: 'video/mp4' });

  // Thử gửi dạng sendVideo trước, có cơ chế retry tối đa 3 lần
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[sendVideo] Đang gửi video lên Telegram (lần thử ${attempt}/3)...`);
      const form = new FormData();
      form.append('chat_id', CHAT_ID);
      form.append('video', blob, path.basename(videoPath));
      if (caption) form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      form.append('supports_streaming', 'true');
      if (replyToId) form.append('reply_to_message_id', replyToId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.ok) {
        console.log(`[sendVideo] Gửi video thành công! Message ID:`, data.result.message_id);
        return data.result;
      }

      console.warn(`[sendVideo] Lần ${attempt} trả về lỗi:`, data.description);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 4000));
      } else {
        throw new Error(data.description || 'Lỗi gửi video lên Telegram');
      }
    } catch (err) {
      console.warn(`[sendVideo] Lỗi ở lần thử ${attempt}:`, err.message);
      if (attempt >= 3) {
        // Fallback sang sendDocument nếu sendVideo liên tục bị Gateway Timeout
        console.log(`[Fallback] Thử gửi dưới dạng sendDocument...`);
        try {
          const docForm = new FormData();
          docForm.append('chat_id', CHAT_ID);
          docForm.append('document', blob, path.basename(videoPath));
          if (caption) docForm.append('caption', caption);
          docForm.append('parse_mode', 'HTML');
          if (replyToId) docForm.append('reply_to_message_id', replyToId);

          const docRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: docForm,
          });
          const docData = await docRes.json();
          if (docData.ok) {
            console.log(`[sendDocument] Fallback thành công! Message ID:`, docData.result.message_id);
            return docData.result;
          }
        } catch (fallbackErr) {
          console.error(`[Fallback] Gửi sendDocument cũng thất bại:`, fallbackErr.message);
        }
        throw err;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

// ─── Network & Scraper ───────────────────────────────────────────────────────
async function fetchHtml(url, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Quá nhiều lượt chuyển hướng (redirect loop)');
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return fetchHtml(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        }
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let buffer = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'];
          try {
            if (encoding === 'gzip') buffer = zlib.gunzipSync(buffer);
            else if (encoding === 'deflate') buffer = zlib.inflateSync(buffer);
            else if (encoding === 'br') buffer = zlib.brotliDecompressSync(buffer);
          } catch (e) {}
          resolve(buffer.toString('utf-8'));
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tải trang web quá thời gian (timeout)'));
    });
    req.on('error', reject);
  });
}

function extractDomainName(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host.includes('dantri')) return 'BÁO DÂN TRÍ';
    if (host.includes('tuoitre')) return 'BÁO TUỔI TRẺ';
    if (host.includes('vnexpress')) return 'VNEXPRESS';
    if (host.includes('tienphong')) return 'BÁO TIỀN PHONG';
    if (host.includes('thanhnien')) return 'BÁO THANH NIÊN';
    if (host.includes('kenh14')) return 'KÊNH 14';
    if (host.includes('cand')) return 'BÁO CÔNG AN NHÂN DÂN';
    if (host.includes('laodong')) return 'BÁO LAO ĐỘNG';
    if (host.includes('vietnamnet')) return 'VIETNAMNET';
    if (host.includes('thethaovanhoa')) return 'THỂ THAO & VĂN HÓA';
    return host.replace(/^www\./, '').toUpperCase();
  } catch (e) {
    return 'BÁO ĐIỆN TỬ';
  }
}

// Hàm kiểm tra 2 URL ảnh có cùng một gốc ảnh không (để tránh trùng lặp giữa ảnh thân bài và og:image thu nhỏ)
function isSameImage(url1, url2) {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const f1 = url1.split('/').pop().split('?')[0].toLowerCase();
  const f2 = url2.split('/').pop().split('?')[0].toLowerCase();
  if (f1 === f2) return true;
  const stem1 = f1.replace(/-crop-.*$/, '').replace(/-\d+$/, '').slice(0, 25);
  const stem2 = f2.replace(/-crop-.*$/, '').replace(/-\d+$/, '').slice(0, 25);
  if (stem1.length >= 10 && stem2.length >= 10 && (stem1.includes(stem2) || stem2.includes(stem1))) {
    return true;
  }
  return false;
}

async function scrapeArticle(url) {
  const html = await fetchHtml(url);
  const domain = extractDomainName(url);

  // 1. Title
  let title = '';
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  } else {
    const metaTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["'](.*?)["']/i);
    if (metaTitle) title = metaTitle[1].trim();
  }

  // 2. Meta tags: og:image, twitter:image, image, thumbnailUrl (Ảnh đại diện chính thức của bài báo)
  const metaImages = [];
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const attrs = metaMatch[1];
    const isImageMeta = /(?:property|name|itemprop)=["'](?:og:image|twitter:image|image|thumbnailUrl)["']/i.test(attrs);
    if (isImageMeta) {
      const c = attrs.match(/content=["']([^"']+)["']/i);
      if (c && c[1].startsWith('http') && !metaImages.includes(c[1])) {
        const lower = c[1].toLowerCase();
        // Loại bỏ logo website, banner chung, default avatar
        if (
          !lower.includes('logo') &&
          !lower.includes('banner') &&
          !lower.includes('avatar') &&
          !lower.includes('share') &&
          !lower.includes('.svg') &&
          !lower.includes('.gif')
        ) {
          metaImages.push(c[1]);
        }
      }
    }
  }

  // Link rel="image_src"
  const linkRegex = /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi;
  let lMatch;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    if (lMatch[1].startsWith('http') && !metaImages.includes(lMatch[1])) {
      const lower = lMatch[1].toLowerCase();
      if (!lower.includes('logo') && !lower.includes('banner') && !lower.includes('avatar') && !lower.includes('.svg')) {
        metaImages.push(lMatch[1]);
      }
    }
  }

  // 3. Tìm CHÍNH XÁC trong vùng nội dung bài báo (article body)
  let contentHtml = '';
  const articleTagMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleTagMatch) {
    contentHtml = articleTagMatch[1];
  } else {
    // Tìm vị trí bắt đầu của vùng nội dung bài viết
    const bodySelectors = [
      'detail-cmain', 'content-detail', 'detail-content', 'fck_detail',
      'article__content', 'singular-content', 'article-content', 'cms-body', 'body-content'
    ];
    let startIdx = -1;
    for (const sel of bodySelectors) {
      const match = html.search(new RegExp(`<(?:div|section)[^>]+(?:class|id)=["'][^"']*${sel}`, 'i'));
      if (match !== -1) {
        startIdx = match;
        break;
      }
    }
    if (startIdx !== -1) {
      // Cắt từ điểm bắt đầu đến footer/sidebar hoặc tối đa 80.000 ký tự
      const rawChunk = html.slice(startIdx, startIdx + 80000);
      const cutIdx = rawChunk.search(/<(?:footer|aside|div[^>]+id=["']comment|div[^>]+class=["'][^"']*(?:comment|sidebar|footer))/i);
      contentHtml = cutIdx !== -1 ? rawChunk.slice(0, cutIdx) : rawChunk;
    }
  }

  // Làm sạch mã HTML: loại bỏ triệt để style, script, form, các khối minigame, tin liên quan, quảng cáo
  const cleanedHtml = (contentHtml || html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<div[^>]+(?:class|type)=["'][^"']*(?:boxG_|minigame|game-box|box-game|poll|vote|tin_lien_quan|tin-lien-quan|related|suggest|box-share|comment|banner|adbox|quangcao|sidebar)[^"']*["'][\s\S]*?<\/div>/gi, '');

  // 4. Trích xuất Paragraphs từ văn bản sạch (loại bỏ hoàn toàn CSS hay mã rác)
  const paras = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(cleanedHtml)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      text.length > 25 &&
      !text.includes('Theo dõi') &&
      !text.includes('Bản quyền') &&
      !text.startsWith('Ảnh:') &&
      !text.startsWith('Nguồn:')
    ) {
      paras.push(text);
    }
  }

  // 5. Quét ảnh trong thân bài báo (Editorial Body Images)
  const bodyImages = [];
  const badClassOrId = /(?:logo|icon|button|avatar|banner|adbox|box-game|minigame|game-box|quangcao|sidebar|tin_lien_quan|tin-lien-quan|sponsor)/i;
  const imgTagRegex = /<img\s+([^>]+)>/gi;
  let m;
  while ((m = imgTagRegex.exec(cleanedHtml)) !== null) {
    const attrs = m[1];

    // Chỉ lọc bỏ nếu class hoặc id chứa các từ khóa quảng cáo/rác (không lọc rel="lightbox" hay alt của ảnh)
    const classAndId = ((attrs.match(/class=["']([^"']+)["']/i) || [])[1] || '') + ' ' + ((attrs.match(/id=["']([^"']+)["']/i) || [])[1] || '');
    if (badClassOrId.test(classAndId)) {
      continue;
    }

    // Ưu tiên data-original (ảnh gốc phân giải cao không crop), sau đó tới data-src, và cuối cùng src
    const origMatch = attrs.match(/data-original=["'](https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)[^"'\s>]*)/i);
    const dataSrcMatch = attrs.match(/data-src=["'](https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)[^"'\s>]*)/i);
    const srcMatch = attrs.match(/src=["'](https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)[^"'\s>]*)/i);
    const targetMatch = origMatch || dataSrcMatch || srcMatch;
    if (!targetMatch) continue;

    const link = targetMatch[1].split('?')[0].replace(/["']$/, '');
    const lower = link.toLowerCase();

    // Kiểm tra URL ảnh
    const isBadUrl =
      lower.includes('logo') ||
      lower.includes('icon') ||
      lower.includes('avatar') ||
      lower.includes('banner') ||
      lower.includes('adbox') ||
      lower.includes('box-game') ||
      lower.includes('minigame') ||
      lower.includes('35x35') ||
      lower.includes('40x22') ||
      lower.includes('svg') ||
      lower.includes('transparent') ||
      lower.includes('default');

    if (!isBadUrl && !bodyImages.includes(link)) {
      bodyImages.push(link);
    }
  }

  // Kết hợp: Ưu tiên ảnh báo chí gốc trong thân bài (bodyImages) vì là ảnh độ phân giải cao, đầy đủ góc chụp
  const imgUrls = [...bodyImages];

  // Bổ sung ảnh đại diện (metaImages) nếu chưa có hoặc là ảnh bìa độc lập không trùng thân bài
  for (const metaImg of metaImages) {
    const isDup = imgUrls.some((u) => isSameImage(u, metaImg));
    if (!isDup && !imgUrls.includes(metaImg)) {
      imgUrls.push(metaImg);
    }
  }

  return {
    url,
    domain,
    title: title || 'Tin tức nóng trong ngày',
    content: paras.slice(0, 25).join('\n\n'), // Đảm bảo cung cấp đầy đủ dữ liệu thời tiết/sự kiện chi tiết cho AI
    imgUrls: imgUrls.slice(0, 6), // Chỉ giữ tối đa 6 ảnh báo chí thực thụ từ bài viết
  };
}

// ─── Tìm kiếm ảnh báo chí thực tế qua Web (Chỉ kích hoạt khi bài viết không có ảnh) ─────────
async function searchNewsImages(query) {
  try {
    const cleanQ = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const q = encodeURIComponent(cleanQ.slice(0, 60) + ' báo');
    const url = `https://www.bing.com/images/async?q=${q}&first=1&count=20&mmasync=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const murlMatches = [...html.matchAll(/murl&quot;:&quot;(http[^&]+)&quot;/gi)].map(m => m[1]);
    return murlMatches;
  } catch (e) {
    console.warn('[searchNewsImages] Lỗi tìm ảnh báo chí bổ trợ:', e.message);
    return [];
  }
}

async function downloadAndCropImages(imgUrls, outDir, fallbackQuery = '') {
  fs.mkdirSync(outDir, { recursive: true });
  const rawDownloaded = [];

  // Lần 1: Chỉ tải các ảnh báo chí thực thụ được trích xuất từ bài báo
  for (let i = 0; i < imgUrls.length; i++) {
    if (rawDownloaded.length >= 4) break;
    const imgUrl = imgUrls[i];
    const rawPath = path.join(outDir, `raw_${rawDownloaded.length}.jpg`);

    try {
      const res = await fetch(imgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res.ok) continue;
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength < 15360) continue; // Bỏ qua file < 15KB

      fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));

      // Kiểm tra kích thước qua Python PIL: width >= 350, height >= 220, tỷ lệ ảnh chuẩn báo chí 0.45 <= r <= 2.5
      const checkPy = `python3 -c "
from PIL import Image
im = Image.open('${rawPath}')
w, h = im.size
if w < 350 or h < 220:
    exit(1)
ratio = w / h
# Bỏ qua banner quảng cáo ngang dài (ratio > 2.5) hoặc dải dọc (ratio < 0.45)
if ratio < 0.45 or ratio > 2.5:
    exit(1)
"`;
      try {
        execSync(checkPy);
        rawDownloaded.push(rawPath);
        console.log(`  [Ảnh báo chí ${rawDownloaded.length}] Tải thành công ảnh sắc nét: ${imgUrl.slice(0, 75)}...`);
      } catch (e) {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      }
    } catch (e) {}
  }

  // Lần 2: CHỈ KHI bài báo không có ảnh nào (0 ảnh) hoặc người dùng gửi text, mới kích hoạt tìm kiếm ảnh báo chí
  if (rawDownloaded.length === 0 && fallbackQuery) {
    console.log(`🔍 Bài viết không có ảnh sẵn, đang tìm kiếm ảnh báo chí thực tế cho: "${fallbackQuery.slice(0, 60)}"...`);
    const searched = await searchNewsImages(fallbackQuery);
    for (let i = 0; i < searched.length; i++) {
      if (rawDownloaded.length >= 4) break;
      const imgUrl = searched[i];
      const rawPath = path.join(outDir, `raw_${rawDownloaded.length}.jpg`);

      try {
        const res = await fetch(imgUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength < 15360) continue;
        fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));

        const checkPy = `python3 -c "
from PIL import Image
im = Image.open('${rawPath}')
w, h = im.size
if w < 350 or h < 220:
    exit(1)
ratio = w / h
if ratio < 0.45 or ratio > 2.5:
    exit(1)
"`;
        try {
          execSync(checkPy);
          rawDownloaded.push(rawPath);
          console.log(`  [Ảnh tìm kiếm ${rawDownloaded.length}] Tải thành công ảnh báo chí: ${imgUrl.slice(0, 75)}...`);
        } catch (e) {
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        }
      } catch (e) {}
    }
  }

  const savedImages = [];

  // Tạo trọn bộ 4 ảnh crop 1080x1040 CHỈ TỪ CÁC ẢNH CHÍNH THỨC CỦA BÀI BÁO (Không dùng bất kỳ ảnh ngoài nào!)
  if (rawDownloaded.length > 0) {
    const pyScript = `python3 -c "
from PIL import Image
import os

target_w, target_h = 1080, 1040
target_ratio = target_w / target_h

def make_center_crop(im):
    w, h = im.size
    current_ratio = w / h
    if current_ratio > target_ratio:
        nw = int(h * target_ratio)
        left = (w - nw) // 2
        c = im.crop((left, 0, left + nw, h))
    else:
        nh = int(w / target_ratio)
        top = (h - nh) // 2
        c = im.crop((0, top, w, top + nh))
    return c.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB')

def make_zoom_crop(base, zoom_factor=0.85):
    margin_w = int(target_w * (1 - zoom_factor) / 2)
    margin_h = int(target_h * (1 - zoom_factor) / 2)
    z = base.crop((margin_w, margin_h, target_w - margin_w, target_h - margin_h))
    return z.resize((target_w, target_h), Image.Resampling.LANCZOS)

def make_upper_crop(base):
    u = base.crop((0, 0, target_w, int(target_h * 0.85)))
    return u.resize((target_w, target_h), Image.Resampling.LANCZOS)

out_dir = '${outDir}'
raw_count = ${rawDownloaded.length}

if raw_count == 1:
    im0 = Image.open('${rawDownloaded[0]}')
    b0 = make_center_crop(im0)
    b0.save(os.path.join(out_dir, 'crop_0.jpg'), quality=95)
    make_zoom_crop(b0, 0.85).save(os.path.join(out_dir, 'crop_1.jpg'), quality=95)
    make_zoom_crop(b0, 0.75).save(os.path.join(out_dir, 'crop_2.jpg'), quality=95)
    make_upper_crop(b0).save(os.path.join(out_dir, 'crop_3.jpg'), quality=95)

elif raw_count == 2:
    im0 = Image.open('${rawDownloaded[0]}')
    im1 = Image.open('${rawDownloaded[1]}')
    b0 = make_center_crop(im0)
    b1 = make_center_crop(im1)
    b0.save(os.path.join(out_dir, 'crop_0.jpg'), quality=95)
    b1.save(os.path.join(out_dir, 'crop_1.jpg'), quality=95)
    make_zoom_crop(b0, 0.85).save(os.path.join(out_dir, 'crop_2.jpg'), quality=95)
    make_zoom_crop(b1, 0.85).save(os.path.join(out_dir, 'crop_3.jpg'), quality=95)

elif raw_count == 3:
    im0 = Image.open('${rawDownloaded[0]}')
    im1 = Image.open('${rawDownloaded[1]}')
    im2 = Image.open('${rawDownloaded[2]}')
    b0 = make_center_crop(im0)
    b1 = make_center_crop(im1)
    b2 = make_center_crop(im2)
    b0.save(os.path.join(out_dir, 'crop_0.jpg'), quality=95)
    b1.save(os.path.join(out_dir, 'crop_1.jpg'), quality=95)
    b2.save(os.path.join(out_dir, 'crop_2.jpg'), quality=95)
    make_zoom_crop(b0, 0.85).save(os.path.join(out_dir, 'crop_3.jpg'), quality=95)

else:
    for i in range(4):
        raw_p = '${path.join(outDir, 'raw_')}' + str(i) + '.jpg'
        b = make_center_crop(Image.open(raw_p))
        b.save(os.path.join(out_dir, f'crop_{i}.jpg'), quality=95)
"`;
    try {
      execSync(pyScript);
      savedImages.push('crop_0.jpg', 'crop_1.jpg', 'crop_2.jpg', 'crop_3.jpg');
    } catch (e) {
      console.error('Lỗi crop ảnh bài báo:', e.message);
    }
  }

  // Fallback cực đoan: Nếu không có bất kỳ ảnh nào
  if (savedImages.length === 0) {
    const fallbackSource = path.join(ROOT, 'public/assets/news/default_news_bg.jpg');
    for (let i = 0; i < 4; i++) {
      const cropPath = path.join(outDir, `crop_${i}.jpg`);
      if (fs.existsSync(fallbackSource)) {
        fs.copyFileSync(fallbackSource, cropPath);
      }
      savedImages.push(`crop_${i}.jpg`);
    }
  }

  return savedImages;
}

// ─── AI Script Generation with Gemini ───────────────────────────────────────
async function generateVideoScript(articleData, targetDuration = 38) {
  if (!ai) throw new Error('GEMINI_API_KEY chưa được cấu hình');

  let lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, tổng số từ khoảng 140 - 160 từ tiếng Việt (tương đương 35 - 38 giây đọc).';
  if (targetDuration <= 32) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, cực kỳ ngắn gọn, cô đọng, tổng số từ khoảng 95 - 110 từ tiếng Việt (tương đương 25 - 30 giây đọc).';
  } else if (targetDuration >= 42 && targetDuration <= 50) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, chi tiết rõ ràng, đầy đủ, tổng số từ khoảng 165 - 185 từ tiếng Việt (tương đương 42 - 47 giây đọc).';
  } else if (targetDuration > 50) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, phân tích sâu và kỹ lưỡng, tổng số từ khoảng 210 - 240 từ tiếng Việt (tương đương 55 - 60 giây đọc).';
  }

  const prompt = `Bạn là biên tập viên tin tức hàng đầu của kênh mạng xã hội "HÓNG HỚT 24/7" (TikTok, Reels, Shorts).
Hãy viết kịch bản video ngắn (khoảng ${targetDuration} giây) từ bài báo sau đây.

THÔNG TIN BÀI BÁO:
- Tiêu đề: ${articleData.title}
- Nguồn: ${articleData.domain}
- Nội dung trích xuất chính xác từ bài báo:
${articleData.content}

CÁC NGUYÊN TẮC BẮT BUỘC (QUAN TRỌNG NHẤT):
1. PHONETIC VOICE: Khi nhắc đến tên kênh, bắt buộc viết là "Hóng Hớt hai tư trên bảy" (tuyệt đối không viết là 24/7 hay hai tư gạch bảy).
2. 3-GIÂY ĐẦU TIÊN (HOOK MỞ ĐẦU): Câu đầu tiên của Cảnh 1 BẮT BUỘC cài từ ngữ khẩn cấp, cảnh báo hoặc gây chú ý (ví dụ: "Tin thời tiết khẩn cấp!", "Tin cực nóng!", "Biến động thời tiết mới nhất!").
3. TRUNG THỰC BÁO CHÍ 100% & TUYỆT ĐỐI KHÔNG NÓI QUÁ / KHÔNG BỊA ĐẶT (ZERO HALLUCINATION & ZERO EXAGGERATION):
   - Bám sát 100% nội dung và mức độ của bài báo: Tuyệt đối KHÔNG THỔI PHỒNG, KHÔNG DÙNG TỪ CỰC ĐOAN SAI SỰ THẬT.
     * Ví dụ: Nếu bài báo ghi "không khí lạnh tăng cường, Bắc Bộ trời rét, vùng núi có nơi rét đậm" thì PHẢI NÓI ĐÚNG là "Bắc Bộ trời rét, riêng vùng núi có nơi rét đậm", TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý nâng lên thành "không khí lạnh cực mạnh" hay "toàn Bắc Bộ chuyển rét đậm rét hại".
   - Số liệu nhiệt độ & lượng mưa: Chỉ trích dẫn chính xác các con số và khu vực có trong bài báo (ví dụ mốc 16-19 độ C lúc 1h sáng, vùng núi 11-14 độ C, lượng mưa 80-160mm). Tuyệt đối không tự suy diễn hay lấy số liệu ngoài bài báo.
   - Địa danh & phạm vi ảnh hưởng: Phải gọi đúng và đủ các địa danh được bài báo nêu rõ (ví dụ: "từ Quảng Trị đến Đà Nẵng và phía Đông các tỉnh từ Quảng Ngãi đến Gia Lai", không được tự ý cắt xén làm sai lệch ranh giới khu vực ảnh hưởng).
   - Nguy cơ & cảnh báo rủi ro: Nêu đúng các hiện tượng nguy hiểm mà bài báo cảnh báo trọng tâm (lốc, sét, mưa đá, gió giật mạnh trong mưa dông, sóng lớn biển động), không tự ý suy đoán lệch trọng tâm sang các hiểm họa khác.
${lengthReq}
4. KHUNG HÌNH (TIÊU ĐỀ CĂN GIỮA TRÊN ẢNH):
   - title: Tiêu đề in hoa, ngắn gọn, phản ánh đúng thực tế, tối đa 5-7 từ.
   - subtitle: 1 câu tóm tắt nội dung cảnh đó (khoảng 10-14 từ).
   - categoryTag: 1 tag cảm xúc có icon (ví dụ: "🚨 TIN CỰC NÓNG", "⛈️ DỰ BÁO THỜI TIẾT", "⚖️ PHÁP LUẬT").
5. CAPTION & 5 HASHTAG: Tạo caption đăng mạng xã hội và CHỈ DÙNG TỐI ĐA 5 HASHTAG (chọn 5 hashtag đắt giá, cô đọng nhất).

TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON (không kèm markdown \`\`\`json):
{
  "scenes": [
    {
      "id": 1,
      "text": "Lời bình voiceover cảnh 1 có hook giật gân...",
      "title": "TIÊU ĐỀ CẢNH 1 IN HOA",
      "subtitle": "Tóm tắt cảnh 1 ngắn gọn",
      "categoryTag": "🚨 TIN NÓNG"
    },
    {
      "id": 2,
      "text": "Lời bình voiceover cảnh 2 phát triển sự việc...",
      "title": "TIÊU ĐỀ CẢNH 2 IN HOA",
      "subtitle": "Tóm tắt cảnh 2",
      "categoryTag": "⚡ DIỄN BIẾN MỚI"
    },
    {
      "id": 3,
      "text": "Lời bình voiceover cảnh 3 đi vào cao trào / chi tiết quan trọng...",
      "title": "TIÊU ĐỀ CẢNH 3 IN HOA",
      "subtitle": "Tóm tắt cảnh 3",
      "categoryTag": "📌 CHI TIẾT ĐẮT GIÁ"
    },
    {
      "id": 4,
      "text": "Lời bình voiceover cảnh 4 kết luận và kêu gọi: Hãy bấm theo dõi Hóng Hớt hai tư trên bảy để cập nhật tin mới nhất nhé!",
      "title": "TIÊU ĐỀ CẢNH 4 IN HOA",
      "subtitle": "Bấm theo dõi kênh để cập nhật diễn biến tiếp theo",
      "categoryTag": "🔔 THEO DÕI NGAY"
    }
  ],
  "captionTitle": "Tiêu đề bài đăng mạng xã hội giật gân",
  "captionBody": "Nội dung caption 2-3 câu tóm tắt sự kiện hấp dẫn",
  "hashtags": ["#honghot247", "#tinnong", "#phapluat", "#vietnam", "#tintuc"]
}`;

  const modelsToTry = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-pro-latest',
  ];

  let response = null;
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Script] Đang tạo kịch bản với model: ${modelName}...`);
      response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      if (response && response.text) {
        console.log(`[Script] Tạo kịch bản thành công với model: ${modelName}!`);
        break;
      }
    } catch (err) {
      console.warn(`[Script] Model ${modelName} gặp lỗi/bận:`, err.message.slice(0, 100));
      lastError = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!response || !response.text) {
    if (process.env.GROQ_API_KEY) {
      console.log('🔄 Đang kích hoạt Groq AI làm dự phòng sinh kịch bản...');
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              {
                role: 'system',
                content: 'Bạn là biên tập viên tin tức cho kênh Hóng Hớt 24/7. Trả về định dạng JSON hợp lệ duy nhất, không dùng markdown ```json hay giải thích.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.6,
          }),
        });
        const groqData = await groqRes.json();
        const groqText = groqData.choices?.[0]?.message?.content;
        if (groqText) {
          response = { text: groqText };
          console.log('✅ Tạo kịch bản thành công bằng Groq AI!');
        }
      } catch (gErr) {
        console.warn('Lỗi Groq fallback:', gErr.message);
      }
    }
  }

  if (!response || !response.text) {
    throw lastError || new Error('Tất cả các model AI đều đang bận, vui lòng thử lại sau giây lát');
  }

  const rawJson = response.text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(rawJson);
}

// ─── Automated End-to-End Pipeline ──────────────────────────────────────────
let isProcessingJob = false;
let lastArticleUrl = '';
let lastSlug = '';

async function executeVideoPipeline(urlOrText, replyMessageId, options = {}) {
  if (isProcessingJob) {
    await sendMessage('⚠️ <b>Hệ thống đang render một video khác!</b>\nNếu bị treo lâu, bạn hãy gửi tin nhắn <code>reset</code> để gỡ treo ngay lập tức nhé.', replyMessageId);
    return;
  }

  isProcessingJob = true;
  lastArticleUrl = urlOrText;
  const targetDuration = options.targetDuration || 38;
  const startTime = Date.now();

  // Watchdog timer: tự động hủy sau 4 phút để chống treo vĩnh viễn
  const watchdog = setTimeout(async () => {
    if (isProcessingJob) {
      console.warn('⚠️ [Watchdog] Quá 4 phút! Tự động gỡ treo hệ thống.');
      isProcessingJob = false;
      await sendMessage('⚠️ <b>Tiến trình xử lý quá 4 phút</b> nên đã tự động ngắt để bảo vệ hệ thống. Bạn có thể gửi lại lệnh ngay bây giờ nhé!', replyMessageId);
    }
  }, 240000);

  try {
    const isUrl = urlOrText.startsWith('http');
    const datePrefix = new Date().toISOString().slice(0, 10);
    let cleanSlug = 'hot-news';

    if (isUrl) {
      cleanSlug = urlOrText
        .split('/')
        .pop()
        .replace(/\.(htm|html|tpo|epi|epi\?.*)$/, '')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .slice(0, 30)
        .toLowerCase() || 'hot-news';
    } else {
      const firstLine = urlOrText.split('\n')[0].replace(/[^\p{L}\p{N}\s]/gu, '').trim();
      cleanSlug = firstLine.toLowerCase().replace(/\s+/g, '-').slice(0, 30) || 'hot-news';
    }

    const slug = `${datePrefix}-${cleanSlug}-${Date.now().toString().slice(-4)}`;
    lastSlug = slug;

    const timeNotice = targetDuration !== 38 ? ` (Thời lượng mục tiêu: ~${targetDuration}s)` : '';
    if (isUrl) {
      await sendMessage(`🎬 <b>Bắt đầu tạo video tự động${timeNotice}!</b>\n📰 <b>Nguồn:</b> <code>${urlOrText}</code>\n🆔 <b>Slug:</b> <code>${slug}</code>\n\n⏳ <i>Bước 1/5: Đang đọc nội dung bài báo & tải ảnh phóng viên...</i>`, replyMessageId);
    } else {
      await sendMessage(`🎬 <b>Bắt đầu tạo video từ nội dung bạn gửi${timeNotice}!</b>\n📝 <b>Tóm tắt:</b> <code>${urlOrText.slice(0, 60)}...</code>\n🆔 <b>Slug:</b> <code>${slug}</code>\n\n⏳ <i>Bước 1/5: Đang đọc chi tiết nội dung & phân tích bối cảnh...</i>`, replyMessageId);
    }
    await sendChatAction('typing');

    // 1. Lấy nội dung bài viết
    let articleData;
    if (isUrl) {
      articleData = await scrapeArticle(urlOrText);
    } else {
      const firstLine = urlOrText.split('\n')[0].trim();
      articleData = {
        url: '',
        domain: 'MẠNG XÃ HỘI',
        title: firstLine.slice(0, 80),
        content: urlOrText,
        imgUrls: [],
      };
    }
    console.log(`[${slug}] Đã tiếp nhận nội dung: ${articleData.title}`);

    // Tải & crop ảnh (Bằng mọi giá phải có ảnh báo chí thực tế, tự động tìm kiếm web nếu trang thiếu ảnh)
    const evidenceDir = path.join(ROOT, `public/${slug}/evidence`);
    const savedImages = await downloadAndCropImages(articleData.imgUrls, evidenceDir, articleData.title);
    console.log(`[${slug}] Đã chuẩn bị ${savedImages.length} ảnh hiển thị.`);

    // 2. Viết kịch bản bằng Gemini AI
    await sendMessage(`✍️ <i>Bước 2/5: AI đang biên tập kịch bản 4 cảnh giật gân chuẩn Hóng Hớt 24/7 (khoảng ${targetDuration}s)...</i>`, replyMessageId);
    await sendChatAction('typing');

    const scriptData = await generateVideoScript(articleData, targetDuration);
    const scriptDir = path.join(ROOT, `videos/${slug}/script`);
    fs.mkdirSync(scriptDir, { recursive: true });

    // Lưu script.json
    fs.writeFileSync(
      path.join(scriptDir, 'script.json'),
      JSON.stringify(
        {
          title: articleData.title,
          script: scriptData.scenes.map((s) => ({ id: s.id, text: s.text })),
        },
        null,
        2
      )
    );

    // Lưu context & plan
    fs.mkdirSync(path.join(ROOT, `videos/${slug}/output`), { recursive: true });
    fs.writeFileSync(path.join(ROOT, `videos/${slug}/context.txt`), `${articleData.title}\n${articleData.url}`);
    fs.writeFileSync(path.join(ROOT, `videos/${slug}/audio.txt`), 'full');
    fs.writeFileSync(path.join(ROOT, `videos/${slug}/template.txt`), 'news/honghot-social');

    // 3. Sinh giọng đọc TTS (Gemini Charon)
    await sendMessage(`🎙 <i>Bước 3/5: Đang thu âm giọng đọc thời sự AI (Charon) & phân tích nhịp từ...</i>`, replyMessageId);
    await sendChatAction('record_voice');

    execSync(`node scripts/tts.mjs "videos/${slug}/script/script.json" "${slug}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    // 4. Tạo phụ đề nhịp từ STT
    execSync(`node scripts/transcribe.mjs "${slug}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    // Tính toán phân bổ khung hình (30fps)
    const timelinePath = path.join(ROOT, `public/${slug}/timeline.json`);
    const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
    const totalDuration = timeline.duration || 36.0;
    const totalFrames = Math.ceil((totalDuration + 0.8) * 30);
    const sceneDur = Math.floor(totalFrames / 4);

    const s1 = sceneDur;
    const s2 = sceneDur;
    const s3 = sceneDur;
    const s4 = totalFrames - (s1 + s2 + s3);

    // Cập nhật tokens.ts
    const tokensContent = `export const SCENE1_DUR = ${s1};
export const SCENE2_DUR = ${s2};
export const SCENE3_DUR = ${s3};
export const SCENE4_DUR = ${s4};

export const TOTAL_FRAMES = ${totalFrames};

export const COLORS = {
  primary: '#FACC15',
  primaryRed: '#DC2626',
  accentGold: '#FACC15',
  secondary: '#DC2626',
  background: '#0A0E1A',
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  accent: '#38BDF8',
};
`;
    fs.writeFileSync(path.join(ROOT, 'src/scenes/tokens.ts'), tokensContent);

    // Cập nhật Root.tsx
    const rootPath = path.join(ROOT, 'src/Root.tsx');
    let rootContent = fs.readFileSync(rootPath, 'utf-8');
    rootContent = rootContent.replace(/slug:\s*['"][^'"]+['"]/, `slug: '${slug}'`);
    fs.writeFileSync(rootPath, rootContent);

    // Cập nhật VideoContent.tsx
    const s1_imgs = savedImages.length >= 2 ? [savedImages[0], savedImages[1]] : [savedImages[0] || 'crop_0.jpg'];
    const s2_imgs = savedImages.length >= 4 ? [savedImages[2], savedImages[3]] : (savedImages.length >= 2 ? [savedImages[1], savedImages[0]] : s1_imgs);
    const s3_imgs = savedImages.length >= 6 ? [savedImages[4], savedImages[5]] : (savedImages.length >= 3 ? [savedImages[2], savedImages[0]] : s1_imgs);
    const s4_imgs = savedImages.length >= 4 ? [savedImages[3], savedImages[1]] : s1_imgs;
    const todayStr = `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    const videoContentCode = `import React from 'react';
import {Audio, staticFile, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {SocialContentScene} from './scenes/SocialContentScene';
import {Subtitles} from './components/Subtitles';
import {SCENE1_DUR, SCENE2_DUR, SCENE3_DUR, SCENE4_DUR, TOTAL_FRAMES} from './scenes/tokens';

export interface VideoContentProps {
  slug?: string;
  showSubtitles?: boolean;
}

export const VideoContent: React.FC<VideoContentProps> = ({
  slug = '${slug}',
  showSubtitles = false,
}) => {
  const transitionTiming = linearTiming({durationInFrames: 15});
  const transition1 = {presentation: fade(), timing: transitionTiming};
  const transition2 = {presentation: slide({direction: 'from-right'}), timing: transitionTiming};
  const transition3 = {presentation: fade(), timing: transitionTiming};

  const sequenceDurations = [
    SCENE1_DUR + 15,
    SCENE2_DUR + 15,
    SCENE3_DUR + 15,
    SCENE4_DUR,
  ];

  return (
    <div style={{flex: 1, backgroundColor: '#000000', position: 'relative', width: 1080, height: 1920}}>
      <Audio src={staticFile('${slug}/voice.mp3')} volume={1.0} />
      <Audio src={staticFile('assets/news/music/the_mountain-news-news-music.mp3')} volume={0.10} loop />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={sequenceDurations[0]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={${JSON.stringify(s1_imgs)}}
            title="${scriptData.scenes[0].title.replace(/"/g, '\\"')}"
            subtitle="${scriptData.scenes[0].subtitle.replace(/"/g, '\\"')}"
            source="THEO: ${articleData.domain}"
            date="${todayStr}"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="${scriptData.scenes[0].categoryTag}"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition1.presentation} timing={transition1.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[1]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={${JSON.stringify(s2_imgs)}}
            title="${scriptData.scenes[1].title.replace(/"/g, '\\"')}"
            subtitle="${scriptData.scenes[1].subtitle.replace(/"/g, '\\"')}"
            source="THEO: ${articleData.domain}"
            date="${todayStr}"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="${scriptData.scenes[1].categoryTag}"
            layoutMode="classic"
            panDirection="right-to-left"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition2.presentation} timing={transition2.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[2]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={${JSON.stringify(s3_imgs)}}
            title="${scriptData.scenes[2].title.replace(/"/g, '\\"')}"
            subtitle="${scriptData.scenes[2].subtitle.replace(/"/g, '\\"')}"
            source="THEO: ${articleData.domain}"
            date="${todayStr}"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="${scriptData.scenes[2].categoryTag}"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition3.presentation} timing={transition3.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[3]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={${JSON.stringify(s4_imgs)}}
            title="${scriptData.scenes[3].title.replace(/"/g, '\\"')}"
            subtitle="${scriptData.scenes[3].subtitle.replace(/"/g, '\\"')}"
            source="THEO: ${articleData.domain}"
            date="${todayStr}"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="${scriptData.scenes[3].categoryTag}"
            layoutMode="classic"
            panDirection="right-to-left"
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {showSubtitles && (
        <Subtitles
          slug={slug}
          activeColor="#FACC15"
          fontSize={38}
          bottom="8.5%"
          maxWords={6}
        />
      )}
    </div>
  );
};
`;
    fs.writeFileSync(path.join(ROOT, 'src/VideoContent.tsx'), videoContentCode);

    // 5. Render Video
    await sendMessage(`⚡ <i>Bước 4/5: Đang kết xuất video 1080x1920 (Remotion H.264)... Vui lòng đợi khoảng 30 giây...</i>`, replyMessageId);
    await sendChatAction('upload_video');

    const outputPath = path.join(ROOT, `videos/${slug}/output/video.mp4`);
    execSync(`npx remotion render src/Root.tsx SocialVideo "${outputPath}" --codec=h264 --concurrency=2 --timeout=60000`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

    // Nếu chạy cục bộ trên bot Telegram thì mới cần nén và gửi file video
    // Nếu chạy trên GitHub Actions thì BỎ NÉN (giữ nét gốc) và BỎ GỬI FILE (tải trực tiếp từ GitHub siêu tốc)
    if (!isGitHubActions && replyMessageId) {
      const optPath = path.join(ROOT, `videos/${slug}/output/video_opt.mp4`);
      try {
        console.log('⚡ Đang nén video tối ưu dung lượng với FFmpeg...');
        execSync(`ffmpeg -i "${outputPath}" -vcodec libx264 -crf 26 -preset fast -acodec aac -b:a 128k "${optPath}" -y`, {
          cwd: ROOT,
          stdio: 'pipe',
        });
        if (fs.existsSync(optPath) && fs.statSync(optPath).size > 0) {
          fs.renameSync(optPath, outputPath);
          console.log(`✅ Nén video hoàn tất! Dung lượng mới: ${(fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2)} MB`);
        }
      } catch (e) {
        console.warn('⚠️ Bỏ qua nén FFmpeg:', e.message);
      }

      await sendMessage(`📤 <i>Bước 5/5: Đang tải video hoàn thiện lên Telegram của bạn...</i>`, replyMessageId);
      await sendChatAction('upload_video');
      try {
        const hashtagsStr = scriptData.hashtags.slice(0, 5).join(' ');
        const caption = `🚨 <b>${scriptData.captionTitle}</b>\n\n${scriptData.captionBody}\n\n📌 <b>Nguồn:</b> ${articleData.domain}\n\n${hashtagsStr}`;
        await sendVideo(outputPath, caption, replyMessageId);
      } catch (sendErr) {
        console.warn('⚠️ Gửi trực tiếp qua Telegram thất bại:', sendErr.message);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const runUrl = process.env.GITHUB_RUN_URL;
    const hashtagsStr = scriptData.hashtags.slice(0, 5).join(' ');
    let finishMsg = `🎉 <b>XUẤT VIDEO THÀNH CÔNG!</b>\n⏱ <b>Thời gian xử lý:</b> ${elapsed} giây\n📐 <b>Định dạng:</b> 1080x1920 (Nét gốc)\n🎬 <b>Thời lượng:</b> ${(totalFrames / 30).toFixed(1)}s\n\n` +
      `📝 <b>Caption gợi ý đăng bài:</b>\n🚨 <b>${scriptData.captionTitle}</b>\n${scriptData.captionBody}\n\n📌 <b>Nguồn:</b> ${articleData.domain}\n${hashtagsStr}\n\n`;

    if (runUrl) {
      finishMsg += `📥 <b>Link tải video trực tiếp cho điện thoại:</b>\nhttps://github.com/QuangLong910/ai-gen-video/releases\n<i>(Bấm vào link ➔ chạm vào file <b>video.mp4</b> là lưu thẳng vào Thư viện ảnh điện thoại!)</i>`;
    } else {
      finishMsg += `👉 <i>Video đã gửi ở trên, bạn có thể lưu về máy để đăng ngay!</i>`;
    }

    await sendMessage(finishMsg, replyMessageId);
  } catch (error) {
    console.error('❌ Lỗi quy trình tạo video:', error);
    await sendMessage(`❌ <b>Lỗi trong quá trình tạo video:</b>\n<code>${error.message}</code>`, replyMessageId);
  } finally {
    clearTimeout(watchdog);
    isProcessingJob = false;
  }
}

// ─── Telegram Long Polling Loop ──────────────────────────────────────────────
let lastUpdateId = 0;

async function pollTelegramUpdates() {
  try {
    const updates = await callTelegram('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 25,
      allowed_updates: ['message'],
    });

    if (Array.isArray(updates)) {
      for (const update of updates) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        // Chỉ chấp nhận tin nhắn từ người dùng được cấp quyền (CHAT_ID)
        if (msg.chat.id.toString() !== CHAT_ID.toString()) {
          console.warn(`[Cảnh báo] Nhận tin nhắn từ Chat ID lạ: ${msg.chat.id}. Bỏ qua.`);
          continue;
        }

        const text = msg.text.trim();
        const msgId = msg.message_id;
        const lower = text.toLowerCase();
        console.log(`[Telegram] Nhận lệnh từ Chat ID: "${text}"`);

        // 1. Lệnh khẩn cấp gỡ treo hệ thống
        if (lower === 'reset' || lower === 'hủy' || lower === 'huy' || lower === 'gỡ treo' || lower === 'go treo' || lower === '/cancel') {
          isProcessingJob = false;
          await sendMessage('🔄 <b>Đã gỡ treo hệ thống thành công!</b> Bạn có thể gửi link mới ngay bây giờ.', msgId);
          continue;
        }

        // 2. Trợ giúp & Bắt đầu
        if (text === '/start' || text === '/help') {
          const helpText = `👋 <b>Chào mừng bạn đến với Hóng Hớt 24/7 AI Bot!</b>\n\n` +
            `🎯 <b>CÁC LỆNH BẠN CÓ THỂ DÙNG TRÊN ĐIỆN THOẠI:</b>\n\n` +
            `1️⃣ <b>Tạo video tự động:</b>\n` +
            `👉 Gửi trực tiếp <b>link bài báo</b> (Tuổi Trẻ, Dân Trí, VnExpress, Tiền Phong...).\n` +
            `👉 Có thể kèm thời lượng mong muốn: <code>&lt;link&gt; 45s</code> hoặc <code>&lt;link&gt; 30s</code>.\n\n` +
            `2️⃣ <b>Yêu cầu làm lại video:</b>\n` +
            `👉 <code>làm lại 45s</code> hoặc <code>làm lại 30s</code>: Sẽ tự động làm lại bài báo gần nhất với độ dài bạn muốn!\n` +
            `👉 <code>đổi ảnh</code>: Tự động đổi góc ảnh và phối hợp ảnh mới cho bài báo gần nhất.\n\n` +
            `3️⃣ <b>Xử lý khi bị treo:</b>\n` +
            `👉 Gõ <code>reset</code> hoặc <code>hủy</code>: Lập tức gỡ treo và giải phóng máy để nhận lệnh mới.\n\n` +
            `4️⃣ <b>Săn tin hot & Xu hướng:</b>\n` +
            `👉 Gõ <code>/trend</code> hoặc <code>/tin</code>\n` +
            `👉 Gõ <code>/status</code> để xem tình trạng hoạt động.`;
          await sendMessage(helpText, msgId);
          continue;
        }

        // 3. Quét tin hot
        if (text === '/trend' || text === '/tin') {
          await sendMessage('🔍 <i>Đang quét tin hot mới nhất từ TikTok, Facebook và Google Trends...</i>', msgId);
          await runScan(true);
          continue;
        }

        // 4. Kiểm tra trạng thái
        if (text === '/status') {
          const uptimeMinutes = Math.round(process.uptime() / 60);
          await sendMessage(`🟢 <b>Hệ thống đang hoạt động tốt!</b>\n⏱ Thời gian chạy: ${uptimeMinutes} phút\n🎬 Kênh: HÓNG HỚT 24/7\n📰 Bài gần nhất: <code>${lastArticleUrl || 'Chưa có'}</code>`, msgId);
          continue;
        }

        // 5. Làm lại theo thời lượng (ví dụ: "làm lại 45s", "làm 30 giây", "rút ngắn 30s", "45s")
        const durationOnlyMatch = text.match(/^(?:làm lại|sửa lại|chỉnh|rút ngắn|kéo dài)?\s*(\d{2})\s*(?:s|giây|sec)$/i);
        if (durationOnlyMatch && !text.includes('http')) {
          if (!lastArticleUrl) {
            await sendMessage('💡 <i>Chưa có bài báo gần nhất trong bộ nhớ. Bạn hãy gửi link bài báo kèm thời lượng nhé (Ví dụ: &lt;link&gt; 45s)!</i>', msgId);
            continue;
          }
          const sec = parseInt(durationOnlyMatch[1], 10);
          await sendMessage(`🔄 <b>Đang làm lại video từ bài báo gần nhất với thời lượng ~${sec} giây...</b>`, msgId);
          executeVideoPipeline(lastArticleUrl, msgId, { targetDuration: sec });
          continue;
        }

        // 6. Đổi ảnh ("đổi ảnh", "thay ảnh", "sửa ảnh")
        if ((lower.includes('đổi ảnh') || lower.includes('thay ảnh') || lower.includes('sửa ảnh')) && !text.includes('http')) {
          if (!lastArticleUrl) {
            await sendMessage('💡 <i>Chưa có bài báo gần nhất trong bộ nhớ. Bạn hãy gửi link bài báo nhé!</i>', msgId);
            continue;
          }
          await sendMessage('🔄 <b>Đang làm lại video bài báo gần nhất với góc crop và phối hợp ảnh mới...</b>', msgId);
          executeVideoPipeline(lastArticleUrl, msgId, { refreshImages: true });
          continue;
        }

        // 7. Nhận diện link bài báo hoặc đoạn tóm tắt tin tức (có thể kèm thời lượng, ví dụ: "... 45s")
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        let targetSec = 38;
        const inlineSecMatch = text.match(/(\d{2})\s*(?:s|giây|sec)/i);
        if (inlineSecMatch) {
          targetSec = parseInt(inlineSecMatch[1], 10);
        }

        if (urlMatch) {
          const targetUrl = urlMatch[0];
          lastArticleUrl = targetUrl;
          executeVideoPipeline(targetUrl, msgId, { targetDuration: targetSec });
        } else if (text.length >= 25 && !text.startsWith('/')) {
          // Người dùng dán trực tiếp đoạn tóm tắt tin tức!
          lastArticleUrl = text;
          executeVideoPipeline(text, msgId, { targetDuration: targetSec });
        } else {
          await sendMessage('💡 <i>Gửi link bài báo HOẶC dán trực tiếp nội dung tóm tắt tin vào đây để tạo video (kèm 30s hoặc 45s nếu muốn), hoặc gõ "reset" nếu muốn gỡ treo nhé!</i>', msgId);
        }
      }
    }
  } catch (err) {
    if (!err.message.includes('timeout')) {
      console.error('Lỗi polling Telegram:', err.message);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Tiếp tục vòng lặp polling
  setImmediate(pollTelegramUpdates);
}

// ─── Periodic Trend Auto-Scan (Mỗi 30 phút) ──────────────────────────────────
function startPeriodicScanner() {
  console.log('⏰ Đã kích hoạt bộ quét tin tự động định kỳ mỗi 30 phút.');
  setInterval(async () => {
    try {
      console.log('⏰ [Định kỳ] Đang quét tin hot mới gửi về Telegram...');
      await runScan(false);
    } catch (e) {
      console.error('Lỗi quét tin định kỳ:', e.message);
    }
  }, 30 * 60 * 1000);
}

// ─── Khởi chạy: Chế độ CLI hoặc Chế độ Bot Daemon ────────────────────────────
if (process.argv[2]) {
  const targetInput = process.argv[2];
  let targetSec = 38;
  if (process.argv[3]) {
    const parsed = parseInt(process.argv[3].toString().replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 15 && parsed <= 90) {
      targetSec = parsed;
    }
  }
  const isUrl = targetInput.startsWith('http');
  console.log(`[CLI] 🚀 Khởi chạy tạo video trực tiếp cho ${isUrl ? 'URL' : 'nội dung văn bản'}: ${targetInput.slice(0, 80)} (thời lượng: ${targetSec}s)`);
  executeVideoPipeline(targetInput, null, { targetDuration: targetSec })
    .then(() => {
      console.log('✅ [CLI] Toàn bộ pipeline đã hoàn tất thành công!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ [CLI] Lỗi pipeline:', err);
      process.exit(1);
    });
} else {
  console.log('====================================================');
  console.log('🚀 DỊCH VỤ TELEGRAM BOT 2 CHIỀU ĐÃ BẮT ĐẦU HOẠT ĐỘNG');
  console.log(`🤖 Bot Username: @honghot247_hunter_bot`);
  console.log(`👤 Authorized Chat ID: ${CHAT_ID}`);
  console.log('====================================================');

  sendMessage('🟢 <b>Dịch vụ Hóng Hớt 24/7 Bot đã kích hoạt!</b>\nTừ bây giờ bạn có thể gửi trực tiếp link bài báo vào đây để tự động làm video nhé!').catch(() => {});
  startPeriodicScanner();
  pollTelegramUpdates();
}
