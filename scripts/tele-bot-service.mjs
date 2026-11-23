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
import {
  extractArticleBodyHtml,
  extractImagesFromHtml,
  extractVideosFromHtml,
  downloadArticleMedia,
  distributeMediaToScenes,
} from './article-media.mjs';
import {
  loadBotMemory,
  saveBotMemory,
  updateLastJob,
  addCustomDirective,
  removeCustomDirective,
  clearCustomDirectives,
  analyzeUserMessage,
} from './tele-bot-brain.mjs';
import { verifyAndFactCheckScript } from './fact-checker.mjs';
import {
  formatScriptForTelegram,
  createApprovalSession,
  getActiveApproval,
  clearActiveApproval,
  parseApprovalInput,
} from './script-approval.mjs';

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

  // 2. Tìm CHÍNH XÁC toàn bộ vùng nội dung bài báo (tránh bị cắt cụt bởi thẻ lồng nhau hoặc thẻ <article> tin liên quan)
  const cleanedHtml = extractArticleBodyHtml(html);

  // 3. Trích xuất Paragraphs từ văn bản sạch
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

  // 4. Trích xuất ĐẦY ĐỦ TẤT CẢ ảnh & video từ bài viết (hỗ trợ <picture>, srcset, data-original, data-src, signed CDN URL, video mp4/m3u8, JSON-LD...)
  const imgUrls = extractImagesFromHtml(cleanedHtml, html, url, 24);
  const videoUrls = extractVideosFromHtml(cleanedHtml, html, url, 8);

  return {
    url,
    domain,
    title: title || 'Tin tức nóng trong ngày',
    content: paras.slice(0, 25).join('\n\n'), // Đảm bảo cung cấp đầy đủ dữ liệu thời tiết/sự kiện chi tiết cho AI
    imgUrls,
    videoUrls,
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

// ─── AI Script Generation with Gemini ───────────────────────────────────────
async function generateVideoScript(articleData, targetDuration = 38, userFeedback = null) {
  if (!ai) throw new Error('GEMINI_API_KEY chưa được cấu hình');

  let lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, tổng số từ khoảng 140 - 160 từ tiếng Việt (tương đương 35 - 38 giây đọc).';
  if (targetDuration <= 32) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, cực kỳ ngắn gọn, cô đọng, tổng số từ khoảng 95 - 110 từ tiếng Việt (tương đương 25 - 30 giây đọc).';
  } else if (targetDuration >= 42 && targetDuration <= 50) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, chi tiết rõ ràng, đầy đủ, tổng số từ khoảng 165 - 185 từ tiếng Việt (tương đương 42 - 47 giây đọc).';
  } else if (targetDuration > 50) {
    lengthReq = '3. THỜI LƯỢNG: Đúng 4 cảnh, phân tích sâu và kỹ lưỡng, tổng số từ khoảng 210 - 240 từ tiếng Việt (tương đương 55 - 60 giây đọc).';
  }

  let feedbackSection = '';
  if (userFeedback && typeof userFeedback === 'string' && userFeedback.trim()) {
    feedbackSection = `
6. ⚠️ CHỈ ĐẠO ĐẶC BIỆT / GÓP Ý SỬA LỖI TỪ BIÊN TẬP VIÊN (BẮT BUỘC TUÂN THỦ 100%):
Chủ kênh đã gửi chỉ đạo sửa kịch bản cho video này như sau:
"${userFeedback.trim()}"
=> BẮT BUỘC biên tập lại kịch bản để đáp ứng chính xác 100% chỉ đạo trên (sửa đổi nội dung, câu từ, chi tiết, hoặc số liệu theo đúng chỉ đạo)!`;
  }

  const memory = loadBotMemory();
  let directivesSection = '';
  if (memory.customDirectives && memory.customDirectives.length > 0) {
    directivesSection = `
7. CÁC NGUYÊN TẮC / DẶN DÒ TỪ CHỦ KÊNH ĐÃ LƯU TRONG BỘ NHỚ:
${memory.customDirectives.map((d, i) => `   - [Quy tắc ${i + 1}]: ${d}`).join('\n')}`;
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
2. 3-GIÂY ĐẦU TIÊN (HOOK MỞ ĐẦU): Câu đầu tiên của Cảnh 1 BẮT BUỘC mở đầu bằng cụm từ cuốn hút, tự nhiên như: "Tin nóng!", "Tin nóng nhất hôm nay!", "Tin cực nóng!", "Biến động mới nhất!"... (TUYỆT ĐỐI KHÔNG dùng từ "khẩn cấp", chỉ cần "Tin nóng!" là đủ lôi cuốn và giữ chân người xem, không gây cảm giác báo động giả).
3. TRUNG THỰC BÁO CHÍ 100% & TUYỆT ĐỐI KHÔNG NÓI QUÁ / KHÔNG BỊA ĐẶT (ZERO HALLUCINATION & ZERO EXAGGERATION):
   - Bám sát 100% nội dung và mức độ của bài báo: Tuyệt đối KHÔNG THỔI PHỒNG, KHÔNG DÙNG TỪ CỰC ĐOAN SAI SỰ THẬT.
     * Ví dụ: Nếu bài báo ghi "không khí lạnh tăng cường, Bắc Bộ trời rét, vùng núi có nơi rét đậm" thì PHẢI NÓI ĐÚNG là "Bắc Bộ trời rét, riêng vùng núi có nơi rét đậm", TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý nâng lên thành "không khí lạnh cực mạnh" hay "toàn Bắc Bộ chuyển rét đậm rét hại".
   - Số liệu nhiệt độ & lượng mưa: Chỉ trích dẫn chính xác các con số và khu vực có trong bài báo (ví dụ mốc 16-19 độ C lúc 1h sáng, vùng núi 11-14 độ C, lượng mưa 80-160mm). Tuyệt đối không tự suy diễn hay lấy số liệu ngoài bài báo.
   - Địa danh & phạm vi ảnh hưởng: Phải gọi đúng và đủ các địa danh được bài báo nêu rõ (ví dụ: "từ Quảng Trị đến Đà Nẵng và phía Đông các tỉnh từ Quảng Ngãi đến Gia Lai", không được tự ý cắt xén làm sai lệch ranh giới khu vực ảnh hưởng).
   - Nguy cơ & cảnh báo rủi ro: Nêu đúng các hiện tượng nguy hiểm mà bài báo cảnh báo trọng tâm (lốc, sét, mưa đá, gió giật mạnh trong mưa dông, sóng lớn biển động), không tự ý suy đoán lệch trọng tâm sang các hiểm họa khác.
   - ĐỐI VỚI TIN CHÍNH SÁCH, PHÁP LUẬT, THUẾ, PHÍ, QUY ĐỊNH MỚI (POLICY & EFFECTIVE DATE):
     * BẮT BUỘC NÊU RÕ MỐC THỜI GIAN CÓ HIỆU LỰC / LỘ TRÌNH THỰC THI (ví dụ: "áp dụng từ ngày 1/7/2027", "bắt đầu từ đầu năm tới") nếu bài báo có đề cập. Tuyệt đối không diễn đạt chung chung khiến người xem hiểu nhầm là chính sách áp dụng ngay lập tức!
     * Nêu rõ con số định lượng cụ thể (mức thuế suất 0,2%), đối tượng áp dụng (đất bỏ hoang, chậm đưa vào sử dụng) và căn cứ xác định theo luật định, tránh dùng các câu từ sáo rỗng, khái quát.
${lengthReq}
4. KHUNG HÌNH (TIÊU ĐỀ CĂN GIỮA TRÊN ẢNH):
   - title: Tiêu đề in hoa, ngắn gọn, phản ánh đúng thực tế, tối đa 5-7 từ.
   - subtitle: 1 câu tóm tắt nội dung cảnh đó (khoảng 10-14 từ).
   - categoryTag: 1 tag cảm xúc có icon (ví dụ: "🚨 TIN CỰC NÓNG", "⛈️ DỰ BÁO THỜI TIẾT", "⚖️ PHÁP LUẬT").
5. CAPTION & 5 HASHTAG: Tạo caption đăng mạng xã hội và CHỈ DÙNG TỐI ĐA 5 HASHTAG (chọn 5 hashtag đắt giá, cô đọng nhất).
${feedbackSection}
${directivesSection}

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

  const scriptData = JSON.parse(rawJson);

  // Bộ lọc chuẩn hóa tự động: Ngăn chặn triệt để tình trạng AI tự ý thêm từ phóng đại hoặc tag sai sự thật
  if (Array.isArray(scriptData.scenes)) {
    for (const scene of scriptData.scenes) {
      if (scene.categoryTag) {
        scene.categoryTag = scene.categoryTag
          .replace(/rét đậm rét hại/gi, 'VÙNG NÚI RÉT ĐẬM')
          .replace(/rét hại/gi, 'TRỜI RÉT');
      }
      if (scene.title) {
        scene.title = scene.title
          .replace(/cực mạnh/gi, 'tăng cường')
          .replace(/rét hại/gi, 'trời rét');
      }
      if (scene.subtitle) {
        scene.subtitle = scene.subtitle.replace(/rét hại/gi, 'trời rét');
      }
      if (scene.text) {
        scene.text = scene.text
          .replace(/tin thời tiết khẩn cấp[!,.]*/gi, 'Tin thời tiết mới nhất!')
          .replace(/tin khẩn cấp[!,.]*/gi, 'Tin nóng!')
          .replace(/tăng cường mạnh mẽ/gi, 'tiếp tục tăng cường')
          .replace(/không khí lạnh cực mạnh/gi, 'không khí lạnh tăng cường')
          .replace(/rét đậm rét hại/gi, 'trời rét, vùng núi có nơi rét đậm');
      }
    }
  }

  return scriptData;
}

// ─── Automated End-to-End Pipeline ──────────────────────────────────────────
let isProcessingJob = false;
let lastArticleUrl = '';
let lastSlug = '';

// Nạp bài gần nhất và các quy tắc từ bộ nhớ bền vững (videos/.bot-memory.json)
const bootMemory = loadBotMemory();
if (bootMemory.lastJob) {
  lastArticleUrl = bootMemory.lastJob.urlOrText || '';
  lastSlug = bootMemory.lastJob.slug || '';
  console.log(`[BotBrain] Đã nạp bài gần nhất từ bộ nhớ: "${bootMemory.lastJob.articleTitle}"`);
}
if (bootMemory.customDirectives && bootMemory.customDirectives.length > 0) {
  console.log(`[BotBrain] Đang kích hoạt ${bootMemory.customDirectives.length} quy tắc dặn dò của chủ kênh.`);
}

async function executeVideoPipeline(urlOrText, replyMessageId, options = {}) {
  if (isProcessingJob) {
    await sendMessage('⚠️ <b>Hệ thống đang render một video khác!</b>\nNếu bị treo lâu, bạn hãy gửi tin nhắn <code>reset</code> để gỡ treo ngay lập tức nhé.', replyMessageId);
    return;
  }

  isProcessingJob = true;
  lastArticleUrl = urlOrText;
  const targetDuration = options.targetDuration || 38;
  const startTime = Date.now();

  // Watchdog timer: tự động hủy sau 15 phút (bao gồm 5 phút chờ duyệt + render) để chống treo vĩnh viễn
  const watchdog = setTimeout(async () => {
    if (isProcessingJob) {
      console.warn('⚠️ [Watchdog] Quá 15 phút! Tự động gỡ treo hệ thống.');
      clearActiveApproval();
      isProcessingJob = false;
      await sendMessage('⚠️ <b>Tiến trình xử lý quá thời gian tối đa</b> nên đã tự động ngắt để bảo vệ hệ thống. Bạn có thể gửi lại lệnh ngay bây giờ nhé!', replyMessageId);
    }
  }, 900000);

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
        videoUrls: [],
      };
    }
    console.log(
      `[${slug}] Đã tiếp nhận nội dung: ${articleData.title} (Tìm thấy ${articleData.imgUrls.length} link ảnh, ${articleData.videoUrls.length} link video)`
    );

    // Tải ĐẦY ĐỦ tất cả tư liệu ảnh & video từ bài báo (chỉ tìm web bổ trợ nếu bài viết không có bất kỳ ảnh/video nào)
    const evidenceDir = path.join(ROOT, `public/${slug}/evidence`);
    const mediaResult = await downloadArticleMedia({
      imgUrls: articleData.imgUrls,
      videoUrls: articleData.videoUrls,
      outDir: evidenceDir,
      articleUrl: articleData.url,
      fallbackQuery: articleData.title,
      searchNewsImagesFn: searchNewsImages,
      fallbackImageSource: path.join(ROOT, 'public/assets/news/default_news_bg.jpg'),
    });
    console.log(
      `[${slug}] Đã chuẩn bị ĐẦY ĐỦ tư liệu: ${mediaResult.rawImageCount} ảnh gốc (${mediaResult.savedImages.length} ảnh hiển thị) + ${mediaResult.rawVideoCount} video tư liệu = ${mediaResult.mediaItems.length} tư liệu ghép vào video.`
    );

    // 2. Viết kịch bản bằng Gemini AI
    const mediaSummary =
      mediaResult.rawVideoCount > 0
        ? `${mediaResult.rawImageCount} ảnh & ${mediaResult.rawVideoCount} video tư liệu`
        : `${mediaResult.rawImageCount || mediaResult.savedImages.length} ảnh tư liệu`;
    await sendMessage(
      `📸 Đã thu thập đầy đủ <b>${mediaSummary}</b> từ bài báo!\n✍️ <i>Bước 2/5: AI đang biên tập kịch bản 4 cảnh giật gân chuẩn Hóng Hớt 24/7 (khoảng ${targetDuration}s)...</i>`,
      replyMessageId
    );
    await sendChatAction('typing');

    let scriptData = await generateVideoScript(articleData, targetDuration, options.userFeedback);

    // 2.5 Kiểm chứng đối soát sự thật với báo chí chính thống (Fact-Checking & Truth Verification)
    await sendMessage(
      `🛡️ <i>Bước 2.5/5: Đang kiểm chứng thông tin với báo chí chính thống để đảm bảo 100% chuẩn xác sự thật...</i>`,
      replyMessageId
    );
    await sendChatAction('typing');

    const factCheckResult = await verifyAndFactCheckScript({
      articleData,
      scriptData,
      aiInstance: ai,
    });
    scriptData = factCheckResult.scriptData;

    // 2.8 Bước Gửi Kịch Bản Chờ Chủ Kênh Duyệt (5 Phút)
    // Nếu chạy qua Telegram bot và không có cờ skipApproval:
    const shouldWaitApproval = !options.skipApproval && !process.env.CI;
    if (shouldWaitApproval) {
      const preview = formatScriptForTelegram(articleData, scriptData, false);
      await sendMessage(preview, replyMessageId);

      const approvalResult = await new Promise((resolve) => {
        createApprovalSession({
          slug,
          scriptData,
          articleData,
          replyMessageId,
          timeoutMs: 300000, // 5 phút chờ duyệt
          onTimeout: async () => {
            await sendMessage(
              `⏱ <b>Đã hết 5 phút chờ duyệt!</b> Hệ thống tự động duyệt kịch bản và tiến hành thu âm TTS & kết xuất video ngay bây giờ...`,
              replyMessageId
            );
          },
          onResolve: resolve,
        });
      });

      if (approvalResult.status === 'CANCELLED') {
        console.log(`[Approval] Lượt tạo video ${slug} đã bị hủy bởi chủ kênh.`);
        await sendMessage('🛑 <b>Đã hủy tiến trình tạo video thành công.</b>', replyMessageId);
        return;
      }

      if (approvalResult.scriptData) {
        scriptData = approvalResult.scriptData;
      }
    }
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

    // Cập nhật VideoContent.tsx — Phân bổ ĐẦY ĐỦ tất cả ảnh & video tư liệu vào 4 cảnh
    const [s1_media, s2_media, s3_media, s4_media] = distributeMediaToScenes(mediaResult.mediaItems, 4);
    const todayStr = `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    const videoContentCode = `import React from 'react';
import {Audio, staticFile, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
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
  const springTransitionTiming = springTiming({durationInFrames: 15, config: {damping: 200}});
  const transition1 = {presentation: slide({direction: 'from-right'}), timing: springTransitionTiming};
  const transition2 = {presentation: wipe({direction: 'from-left'}), timing: transitionTiming};
  const transition3 = {presentation: slide({direction: 'from-bottom'}), timing: springTransitionTiming};

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
            sceneIndex={0}
            media={${JSON.stringify(s1_media)}}
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
            sceneIndex={1}
            media={${JSON.stringify(s2_media)}}
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
            sceneIndex={2}
            media={${JSON.stringify(s3_media)}}
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
            sceneIndex={3}
            media={${JSON.stringify(s4_media)}}
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

    // Tối ưu dung lượng video bằng FFmpeg (giúp video nhẹ, gửi Telegram siêu tốc không lo timeout)
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

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const runUrl = process.env.GITHUB_RUN_URL;
    const hashtagsStr = scriptData.hashtags.slice(0, 5).join(' ');
    let finishMsg = `🎉 <b>XUẤT VIDEO THÀNH CÔNG!</b>\n⏱ <b>Thời gian xử lý:</b> ${elapsed} giây\n🛡️ <b>Kiểm chứng sự thật:</b> ${factCheckResult.summary || '100% Khớp báo chí chính thống'}\n📐 <b>Định dạng:</b> 1080x1920 (Nét gốc)\n🎬 <b>Thời lượng:</b> ${(totalFrames / 30).toFixed(1)}s\n\n` +
      `📝 <b>Caption gợi ý đăng bài:</b>\n🚨 <b>${scriptData.captionTitle}</b>\n${scriptData.captionBody}\n\n📌 <b>Nguồn:</b> ${articleData.domain}\n${hashtagsStr}\n\n`;

    if (runUrl) {
      finishMsg += `📥 <b>Link tải video trực tiếp cho điện thoại:</b>\nhttps://github.com/QuangLong910/ai-gen-video/releases\n<i>(Bấm vào link ➔ chạm vào file <b>video.mp4</b> là lưu thẳng vào Thư viện ảnh điện thoại!)</i>`;
    } else {
      finishMsg += `👉 <i>Video đã gửi ở trên, bạn có thể lưu về máy để đăng ngay!</i>`;
    }

    await sendMessage(finishMsg, replyMessageId);

    // Lưu vào bộ nhớ bot lâu dài để người dùng phản hồi/báo lỗi bất cứ lúc nào
    updateLastJob({
      urlOrText,
      articleTitle: articleData.title,
      articleDomain: articleData.domain,
      articleContentSnippet: articleData.content ? articleData.content.slice(0, 500) : '',
      slug,
      targetDuration,
      scriptSummary: scriptData.scenes.map((s) => `[Cảnh ${s.id}]: ${s.text}`).join(' '),
    });
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

        // 0. Xử lý khi đang trong phiên chờ duyệt kịch bản (Script Approval Gateway - 5 Phút)
        const currentApproval = getActiveApproval();
        if (currentApproval) {
          const parsed = parseApprovalInput(text);

          if (parsed.action === 'APPROVE') {
            await sendMessage('✅ <b>Đã nhận lệnh duyệt của bạn!</b> Đang bắt đầu thu âm giọng đọc và render video ngay...', msgId);
            clearActiveApproval();
            currentApproval.resolve({ status: 'MANUALLY_APPROVED', scriptData: currentApproval.scriptData });
            continue;
          }

          if (parsed.action === 'CANCEL') {
            await sendMessage('🛑 <b>Đã hủy lượt tạo video theo yêu cầu của bạn.</b>', msgId);
            clearActiveApproval();
            currentApproval.resolve({ status: 'CANCELLED', scriptData: null });
            continue;
          }

          if (parsed.action === 'EDIT_REQUEST') {
            await sendMessage(`✍️ <i>Đã nhận yêu cầu sửa kịch bản: "${parsed.feedback}". Đang biên tập lại kịch bản theo ý bạn...</i>`, msgId);
            await sendChatAction('typing');

            let updatedScript = await generateVideoScript(
              currentApproval.articleData,
              currentApproval.targetDuration || 38,
              parsed.feedback
            );

            // Fact-check lại kịch bản mới
            const check = await verifyAndFactCheckScript({
              articleData: currentApproval.articleData,
              scriptData: updatedScript,
              aiInstance: ai,
            });
            const finalScript = check.scriptData;

            currentApproval.scriptData = finalScript;

            // Gửi lại kịch bản mới cho chủ kênh xem
            const newPreview = formatScriptForTelegram(currentApproval.articleData, finalScript, true);
            await sendMessage(newPreview, msgId);
            continue;
          }
        }

        // 1. Lệnh khẩn cấp gỡ treo hệ thống
        if (lower === 'reset' || lower === 'hủy' || lower === 'huy' || lower === 'gỡ treo' || lower === 'go treo' || lower === '/cancel') {
          isProcessingJob = false;
          await sendMessage('🔄 <b>Đã gỡ treo hệ thống thành công!</b> Bạn có thể gửi link mới ngay bây giờ.', msgId);
          continue;
        }

        // 2. Trợ giúp & Bắt đầu
        if (text === '/start' || text === '/help') {
          const helpText = `👋 <b>Chào mừng bạn đến với Hóng Hớt 24/7 AI Bot!</b>\n\n` +
            `🎯 <b>CÁC KHẢ NĂNG THÔNG MINH TRÊN ĐIỆN THOẠI:</b>\n\n` +
            `1️⃣ <b>Tạo video tự động:</b>\n` +
            `👉 Gửi trực tiếp <b>link bài báo</b> (Tuổi Trẻ, Dân Trí, VnExpress, Tiền Phong...).\n` +
            `👉 Hoặc dán cả đoạn tin tức văn bản để làm video.\n\n` +
            `2️⃣ <b>Phản hồi / Báo lỗi / Yêu cầu sửa video:</b>\n` +
            `👉 Bạn chỉ cần <b>nhắn tin tự nhiên như nói chuyện</b>:\n` +
            `   - <i>"Sửa lại video vừa rồi thiếu mốc 1/7/2027"</i>\n` +
            `   - <i>"Bỏ từ khẩn cấp đi, đừng nói rét đậm"</i>\n` +
            `   - <i>"Làm lại 30s thôi"</i> hoặc <i>"Đổi ảnh khác"</i>\n` +
            `⚡ Bot sẽ lập tức phân tích và <b>kết xuất lại video mới đã sửa</b> cho bạn ngay!\n\n` +
            `3️⃣ <b>Dặn dò quy tắc lâu dài:</b>\n` +
            `👉 <i>"Từ nay về sau tin chính sách nhớ thêm mốc thời gian"</i> (Gõ <code>/rules</code> để xem các quy tắc đang lưu).\n\n` +
            `4️⃣ <b>Săn tin hot & Kiểm tra trạng thái:</b>\n` +
            `👉 Nhắn: <code>có tin gì mới ko</code>, <code>tin mới</code>, <code>/trend</code>\n` +
            `👉 Gõ <code>/status</code> để xem bài gần nhất và các quy tắc.`;
          await sendMessage(helpText, msgId);
          continue;
        }

        // 3. Kiểm tra trạng thái hệ thống & bài gần nhất
        if (text === '/status') {
          const uptimeMinutes = Math.round(process.uptime() / 60);
          const memory = loadBotMemory();
          const directives = memory.customDirectives || [];
          let statusMsg = `🟢 <b>Hệ thống đang hoạt động tốt!</b>\n⏱ Thời gian chạy: ${uptimeMinutes} phút\n🎬 Kênh: HÓNG HỚT 24/7\n📰 <b>Bài gần nhất:</b> <code>${memory.lastJob ? memory.lastJob.articleTitle : 'Chưa có'}</code>\n🔗 <b>Nguồn:</b> <code>${memory.lastJob ? memory.lastJob.urlOrText : 'Chưa có'}</code>`;
          if (directives.length > 0) {
            statusMsg += `\n\n📌 <b>Quy tắc chủ kênh đang áp dụng (${directives.length}):</b>\n${directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;
          }
          await sendMessage(statusMsg, msgId);
          continue;
        }

        // 4. Quản lý quy tắc (/rules, xem quy tắc, xóa quy tắc)
        if (text === '/rules' || lower === 'quy tắc' || lower === 'xem quy tắc') {
          const memory = loadBotMemory();
          const directives = memory.customDirectives || [];
          if (directives.length === 0) {
            await sendMessage('💡 <i>Chưa có quy tắc tùy chỉnh nào được lưu. Bạn có thể dặn dò bằng cách nhắn: "Từ nay về sau..." nhé!</i>', msgId);
          } else {
            const list = directives.map((d, i) => `<b>${i + 1}.</b> ${d}`).join('\n\n');
            await sendMessage(`📌 <b>DANH SÁCH QUY TẮC ĐANG ÁP DỤNG (${directives.length}):</b>\n\n${list}\n\n👉 Để xóa quy tắc, hãy gõ: <code>xóa quy tắc [số]</code> (Ví dụ: <code>xóa quy tắc 1</code>) hoặc <code>xóa hết quy tắc</code>.`, msgId);
          }
          continue;
        }

        const delMatch = text.match(/^(?:xóa quy tắc|xoa quy tac)\s*(\d+)$/i);
        if (delMatch) {
          const idx = parseInt(delMatch[1], 10);
          const removed = removeCustomDirective(idx);
          if (removed) {
            await sendMessage(`✅ <b>Đã xóa quy tắc ${idx}:</b> <i>"${removed}"</i>`, msgId);
          } else {
            await sendMessage(`⚠️ Không tìm thấy quy tắc số ${idx}. Gõ <code>/rules</code> để xem danh sách.`, msgId);
          }
          continue;
        }

        if (lower === 'xóa hết quy tắc' || lower === 'xoa het quy tac') {
          clearCustomDirectives();
          await sendMessage('✅ <b>Đã xóa toàn bộ quy tắc tùy chỉnh!</b>', msgId);
          continue;
        }

        // 5. Nếu tin nhắn là URL bài báo thuần túy (hoặc URL kèm số giây như: <link> 45s)
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const isUrlOnly =
          urlMatch &&
          text.replace(urlMatch[0], '').replace(/\d{2}\s*(?:s|giây|sec)/i, '').trim().length === 0;

        if (isUrlOnly) {
          const targetUrl = urlMatch[0];
          let targetSec = 38;
          const inlineSecMatch = text.match(/(\d{2})\s*(?:s|giây|sec)/i);
          if (inlineSecMatch) targetSec = parseInt(inlineSecMatch[1], 10);
          lastArticleUrl = targetUrl;
          executeVideoPipeline(targetUrl, msgId, { targetDuration: targetSec });
          continue;
        }

        // 6. TOÀN BỘ CÁC TIN NHẮN TỰ NHIÊN (Báo lỗi, Góp ý, Sửa kịch bản, Dặn dò, Hỏi đáp, Tin văn bản...)
        // SẼ ĐƯỢC AI NLU PHÂN TÍCH NGỮ NGHĨA VÀ TỰ ĐỘNG THỰC THI HÀNH ĐỘNG
        await sendChatAction('typing');
        const memory = loadBotMemory();
        const analysis = await analyzeUserMessage(text, ai);
        console.log(`[AI Analysis] Intent: ${analysis.intent} | Target: ${analysis.targetDuration}s | Reply: ${analysis.replyText?.slice(0, 60)}...`);

        // Case A: Phản hồi / Báo lỗi / Yêu cầu sửa kịch bản & kết xuất lại video gần nhất
        if (analysis.intent === 'REMAKE_WITH_FEEDBACK') {
          const targetJob = memory.lastJob;
          if (!targetJob || !targetJob.urlOrText) {
            await sendMessage(
              `💡 <i>Tôi hiểu góp ý của bạn: "<b>${analysis.feedback || text}</b>", nhưng hiện chưa tìm thấy video gần nhất trong bộ nhớ để sửa. Bạn hãy gửi link bài báo kèm yêu cầu này nhé!</i>`,
              msgId
            );
            continue;
          }

          await sendMessage(
            analysis.replyText ||
              `🔄 <b>Đã tiếp nhận góp ý:</b> <i>"${analysis.feedback || text}"</i>\n⚡ <b>Đang sửa lại kịch bản và kết xuất video mới ngay lập tức cho bạn...</b>`,
            msgId
          );

          const targetSec = analysis.targetDuration || targetJob.targetDuration || 38;
          executeVideoPipeline(targetJob.urlOrText, msgId, {
            targetDuration: targetSec,
            refreshImages: analysis.refreshImages || false,
            userFeedback: analysis.feedback || text,
          });
          continue;
        }

        // Case B: Dặn dò quy tắc lâu dài
        if (analysis.intent === 'SAVE_DIRECTIVE') {
          if (analysis.directive) {
            addCustomDirective(analysis.directive);
          }
          await sendMessage(
            analysis.replyText ||
              `📌 <i>Đã lưu quy tắc mới vào bộ nhớ hệ thống! Mọi video từ nay về sau sẽ tuân thủ quy tắc này.</i>`,
            msgId
          );
          continue;
        }

        // Case C: Quét tin hot / Trends
        if (analysis.intent === 'TREND_QUERY') {
          await sendMessage(
            analysis.replyText || '🔍 <i>Đang quét và tổng hợp các tin hot, xu hướng mới nhất từ mạng xã hội cho bạn...</i>',
            msgId
          );
          await runScan(true);
          continue;
        }

        // Case D: Tạo video từ đoạn văn bản tin tức
        if (analysis.intent === 'MAKE_VIDEO_TEXT') {
          if (analysis.replyText) await sendMessage(analysis.replyText, msgId);
          const targetContent = analysis.content || text;
          const targetSec = analysis.targetDuration || 38;
          lastArticleUrl = targetContent;
          executeVideoPipeline(targetContent, msgId, { targetDuration: targetSec });
          continue;
        }

        // Case E: Trò chuyện / Thắc mắc / Câu hỏi chung
        if (analysis.intent === 'CHAT_OR_QUESTION') {
          await sendMessage(
            analysis.replyText ||
              '👋 <i>Tôi đã lắng nghe ý kiến của bạn! Nếu bạn muốn làm video mới hoặc sửa video vừa rồi, hãy nhắn chi tiết cho tôi nhé.</i>',
            msgId
          );
          continue;
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

  pollTelegramUpdates();
}
