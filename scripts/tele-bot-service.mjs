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
async function fetchHtml(url) {
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

  // 2. Paragraphs / Sapo
  const paras = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 25 && !text.includes('Theo dõi') && !text.includes('Bản quyền')) {
      paras.push(text);
    }
  }

  // 3. Images (Ưu tiên tuyệt đối og:image chuẩn chất lượng cao và ảnh bài viết, loại bỏ 100% icon/avatar)
  const imgUrls = [];
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](.*?)["']/i);
  if (ogMatch && ogMatch[1]) {
    const ogUrl = ogMatch[1].trim();
    if (!ogUrl.includes('logo') && !ogUrl.includes('avatar') && !ogUrl.includes('icon')) {
      imgUrls.push(ogUrl);
    }
  }

  // Tìm trong vùng nội dung bài báo
  const contentMatch = html.match(/<(?:div|article)[^>]+(?:class|id)=["'][^"']*(?:detail-cmain|content-detail|detail-content|fck_detail|article__content|singular-content|article-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article)>/i);
  const searchHtml = contentMatch ? contentMatch[1] : html;

  const imgRegex = /(?:src|data-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(searchHtml)) !== null) {
    const link = imgMatch[1].split('?')[0];
    const lower = link.toLowerCase();
    if (
      !lower.includes('logo') &&
      !lower.includes('icon') &&
      !lower.includes('avatar') &&
      !lower.includes('userdeffault') &&
      !lower.includes('banner') &&
      !lower.includes('thumb_w/') &&
      !lower.includes('web_images') &&
      !lower.includes('badge') &&
      !imgUrls.includes(link)
    ) {
      imgUrls.push(link);
    }
  }

  return {
    url,
    domain,
    title: title || 'Tin tức nóng trong ngày',
    content: paras.slice(0, 10).join('\n\n'),
    imgUrls: imgUrls.slice(0, 5),
  };
}

async function downloadAndCropImages(imgUrls, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const rawDownloaded = [];

  // Tải các ảnh hợp lệ và kiểm tra độ phân giải tối thiểu (> 300x200)
  for (let i = 0; i < Math.min(imgUrls.length, 6); i++) {
    const imgUrl = imgUrls[i];
    const rawPath = path.join(outDir, `raw_${i}.jpg`);

    try {
      const res = await fetch(imgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength < 10240) continue; // Bỏ qua file rác < 10KB
      fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));

      // Kiểm tra kích thước qua Python PIL, loại bỏ ảnh nhỏ < 300px
      const checkPy = `python3 -c "
from PIL import Image
im = Image.open('${rawPath}')
w, h = im.size
if w < 300 or h < 200:
    exit(1)
"`;
      try {
        execSync(checkPy);
        rawDownloaded.push(rawPath);
      } catch (e) {
        console.warn(`[Loại ảnh rác] Kích thước ảnh quá nhỏ từ: ${imgUrl}`);
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      }
    } catch (e) {
      console.warn(`Lỗi tải ảnh ${i}:`, e.message);
    }
  }

  const savedImages = [];

  // Nếu tải được ảnh chất lượng cao
  if (rawDownloaded.length > 0) {
    // Nếu chỉ có 1 ảnh, tạo 4 góc crop khác nhau (Toàn cảnh, Cận cảnh, Zoom chi tiết)
    if (rawDownloaded.length === 1) {
      const singleRaw = rawDownloaded[0];
      const cropPy = `python3 -c "
from PIL import Image
im = Image.open('${singleRaw}')
w, h = im.size
target_w, target_h = 1080, 1040
target_ratio = target_w / target_h

# Crop 0: Center standard
current_ratio = w / h
if current_ratio > target_ratio:
    nw = int(h * target_ratio)
    left = (w - nw) // 2
    c0 = im.crop((left, 0, left + nw, h))
else:
    nh = int(w / target_ratio)
    top = (h - nh) // 2
    c0 = im.crop((0, top, w, top + nh))
c0.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB').save('${path.join(outDir, 'crop_0.jpg')}', quality=95)

# Crop 1: Zoom left / upper
c1 = c0.crop((0, 0, int(target_w * 0.85), int(target_h * 0.85)))
c1.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB').save('${path.join(outDir, 'crop_1.jpg')}', quality=95)

# Crop 2: Zoom center tight
c2 = c0.crop((int(target_w * 0.1), int(target_h * 0.1), int(target_w * 0.9), int(target_h * 0.9)))
c2.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB').save('${path.join(outDir, 'crop_2.jpg')}', quality=95)

# Crop 3: Fitted wide with clean dark framing
c0.save('${path.join(outDir, 'crop_3.jpg')}', quality=95)
"`;
      try {
        execSync(cropPy);
        savedImages.push('crop_0.jpg', 'crop_1.jpg', 'crop_2.jpg', 'crop_3.jpg');
      } catch (e) {
        console.error('Lỗi multi-crop single image:', e.message);
      }
    } else {
      // Có từ 2 ảnh trở lên: crop từng ảnh
      for (let i = 0; i < rawDownloaded.length; i++) {
        const rawPath = rawDownloaded[i];
        const cropPath = path.join(outDir, `crop_${i}.jpg`);
        const pyCmd = `python3 -c "
from PIL import Image
im = Image.open('${rawPath}')
w, h = im.size
target_w, target_h = 1080, 1040
target_ratio = target_w / target_h
current_ratio = w / h
if current_ratio > target_ratio:
    new_w = int(h * target_ratio)
    left = (w - new_w) // 2
    im_c = im.crop((left, 0, left + new_w, h))
else:
    new_h = int(w / target_ratio)
    top = (h - new_h) // 2
    im_c = im.crop((0, top, w, top + new_h))
im_c.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB').save('${cropPath}', quality=95)
"`;
        try {
          execSync(pyCmd);
          if (fs.existsSync(cropPath)) savedImages.push(`crop_${i}.jpg`);
        } catch (e) {
          console.warn(`Lỗi crop ảnh ${i}:`, e.message);
        }
      }
    }
  }

  // Fallback to stock banner if no valid images found
  if (savedImages.length === 0) {
    const fallbackSource = path.join(ROOT, 'public/banner.png');
    const fallbackDest = path.join(outDir, 'crop_0.jpg');
    if (fs.existsSync(fallbackSource)) {
      fs.copyFileSync(fallbackSource, fallbackDest);
      savedImages.push('crop_0.jpg');
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
- Nội dung tóm tắt:
${articleData.content}

CÁC NGUYÊN TẮC BẮT BUỘC (QUAN TRỌNG NHẤT):
1. PHONETIC VOICE: Khi nhắc đến tên kênh, bắt buộc viết là "Hóng Hớt hai tư trên bảy" (tuyệt đối không viết là 24/7 hay hai tư gạch bảy).
2. 3-GIÂY ĐẦU TIÊN (HOOK MỞ ĐẦU): Câu đầu tiên của Cảnh 1 BẮT BUỘC phải cài từ ngữ giật gân, khẩn cấp (ví dụ: "Tin cực nóng!", "Tin khẩn cấp!", "Biến căng vừa nổ ra!", "Chấn động!").
${lengthReq}
4. KHUNG HÌNH (TIÊU ĐỀ CĂN GIỮA TRÊN ẢNH):
   - title: Tiêu đề in hoa, ngắn gọn, giật gân, tối đa 5-7 từ.
   - subtitle: 1 câu tóm tắt nội dung cảnh đó (khoảng 10-14 từ).
   - categoryTag: 1 tag cảm xúc có icon (ví dụ: "🚨 TIN CỰC NÓNG", "⚖️ PHÁP LUẬT").
5. CAPTION & 5 HASHTAG: Tạo caption đăng mạng xã hội và CHỈ DÙNG TỐI ĐA 5 HASHTAG.

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
    throw lastError || new Error('Tất cả các model Gemini đều đang bận, vui lòng thử lại sau giây lát');
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

async function executeVideoPipeline(url, replyMessageId, options = {}) {
  if (isProcessingJob) {
    await sendMessage('⚠️ <b>Hệ thống đang render một video khác!</b>\nNếu bị treo lâu, bạn hãy gửi tin nhắn <code>reset</code> để gỡ treo ngay lập tức nhé.', replyMessageId);
    return;
  }

  isProcessingJob = true;
  lastArticleUrl = url;
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
    // Tạo slug
    const datePrefix = new Date().toISOString().slice(0, 10);
    const cleanSlug = url
      .split('/')
      .pop()
      .replace(/\.(htm|html|tpo|epi|epi\?.*)$/, '')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 30)
      .toLowerCase() || 'hot-news';
    const slug = `${datePrefix}-${cleanSlug}-${Date.now().toString().slice(-4)}`;
    lastSlug = slug;

    const timeNotice = targetDuration !== 38 ? ` (Thời lượng mục tiêu: ~${targetDuration}s)` : '';
    await sendMessage(`🎬 <b>Bắt đầu tạo video tự động${timeNotice}!</b>\n📰 <b>Nguồn:</b> <code>${url}</code>\n🆔 <b>Slug:</b> <code>${slug}</code>\n\n⏳ <i>Bước 1/5: Đang đọc nội dung bài báo & tải ảnh phóng viên...</i>`, replyMessageId);
    await sendChatAction('typing');

    // 1. Cào bài viết
    const articleData = await scrapeArticle(url);
    console.log(`[${slug}] Đã cào bài viết: ${articleData.title}`);

    // Tải & crop ảnh
    const evidenceDir = path.join(ROOT, `public/${slug}/evidence`);
    const savedImages = await downloadAndCropImages(articleData.imgUrls, evidenceDir);
    console.log(`[${slug}] Đã tải ${savedImages.length} ảnh báo chí thực tế.`);

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

    // Tối ưu dung lượng video bằng FFmpeg (giảm 70-80% dung lượng, chống nghẽn mạng & timeout khi upload Telegram)
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

    // 6. Gửi Video + Caption về Telegram
    await sendMessage(`📤 <i>Bước 5/5: Đang tải video hoàn thiện lên Telegram của bạn...</i>`, replyMessageId);
    await sendChatAction('upload_video');

    const hashtagsStr = scriptData.hashtags.slice(0, 5).join(' ');
    const caption = `🚨 <b>${scriptData.captionTitle}</b>\n\n${scriptData.captionBody}\n\n📌 <b>Nguồn:</b> ${articleData.domain}\n\n${hashtagsStr}`;

    let uploadSuccess = false;
    try {
      await sendVideo(outputPath, caption, replyMessageId);
      uploadSuccess = true;
    } catch (sendErr) {
      console.warn('⚠️ Gửi trực tiếp qua Telegram thất bại (do mạng quốc tế bóp băng thông):', sendErr.message);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const runUrl = process.env.GITHUB_RUN_URL;
    let finishMsg = `🎉 <b>XUẤT VIDEO THÀNH CÔNG!</b>\n⏱ <b>Thời gian xử lý:</b> ${elapsed} giây\n📐 <b>Định dạng:</b> 1080x1920 (9:16 Vertical)\n🎬 <b>Thời lượng:</b> ${(totalFrames / 30).toFixed(1)}s\n\n`;

    if (uploadSuccess) {
      finishMsg += `👉 <i>Video đã gửi ở trên, bạn có thể lưu về máy để đăng ngay!</i>`;
    }
    if (runUrl) {
      finishMsg += `\n\n📥 <b>Link tải video trực tiếp từ GitHub (siêu tốc, nét gốc):</b>\n<a href="${runUrl}">${runUrl}</a>\n<i>(Kéo xuống dưới mục Artifacts để tải file video về điện thoại)</i>`;
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

        // 7. Nhận diện link bài báo (có thể kèm thời lượng, ví dụ: "https://... 45s")
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          const targetUrl = urlMatch[0];
          lastArticleUrl = targetUrl;
          let targetSec = 38;
          const inlineSecMatch = text.match(/(\d{2})\s*(?:s|giây|sec)/i);
          if (inlineSecMatch) {
            targetSec = parseInt(inlineSecMatch[1], 10);
          }
          executeVideoPipeline(targetUrl, msgId, { targetDuration: targetSec });
        } else {
          await sendMessage('💡 <i>Gửi link bài báo vào đây để tạo video (kèm 30s hoặc 45s nếu muốn), hoặc gõ "reset" nếu muốn gỡ treo nhé!</i>', msgId);
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
if (process.argv[2] && process.argv[2].startsWith('http')) {
  const targetUrl = process.argv[2];
  let targetSec = 38;
  if (process.argv[3]) {
    const parsed = parseInt(process.argv[3].toString().replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 15 && parsed <= 90) {
      targetSec = parsed;
    }
  }
  console.log(`[CLI] 🚀 Khởi chạy tạo video trực tiếp cho URL: ${targetUrl} (thời lượng: ${targetSec}s)`);
  executeVideoPipeline(targetUrl, null, { targetDuration: targetSec })
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
