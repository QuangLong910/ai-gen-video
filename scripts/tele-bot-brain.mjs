import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export const BOT_MEMORY_FILE = path.join(ROOT, 'videos/.bot-memory.json');

/**
 * Đọc bộ nhớ bot từ videos/.bot-memory.json
 * Khởi tạo dữ liệu mặc định từ bài gần nhất nếu file chưa tồn tại.
 */
export function loadBotMemory() {
  try {
    if (fs.existsSync(BOT_MEMORY_FILE)) {
      const raw = fs.readFileSync(BOT_MEMORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return {
        lastJob: data.lastJob || null,
        customDirectives: Array.isArray(data.customDirectives) ? data.customDirectives : [],
      };
    }
  } catch (e) {
    console.warn('[BotBrain] Lỗi đọc bộ nhớ bot:', e.message);
  }

  // Khởi tạo mặc định nếu có sẵn bài render gần nhất trong videos/
  let defaultLastJob = null;
  try {
    const defaultContextPath = path.join(
      ROOT,
      'videos/2026-11-20-quoc-hoi-dong-y-ap-thue-0-2-vo-5790/context.txt'
    );
    if (fs.existsSync(defaultContextPath)) {
      const lines = fs.readFileSync(defaultContextPath, 'utf-8').trim().split('\n');
      defaultLastJob = {
        urlOrText: lines[1] || 'https://vietnamnet.vn/quoc-hoi-dong-y-ap-thue-0-2-voi-dat-bo-hoang-2577107.html',
        articleTitle: lines[0] || 'Quốc hội đồng ý áp thuế 0,2% với đất bỏ hoang',
        articleDomain: 'vietnamnet.vn',
        articleContentSnippet: 'Quốc hội đồng ý bổ sung quy định áp dụng mức thuế suất 0,2% đối với đất bỏ hoang, không đưa vào sử dụng...',
        slug: '2026-11-20-quoc-hoi-dong-y-ap-thue-0-2-vo-5790',
        targetDuration: 38,
        scriptSummary: 'Tin nóng! Quốc hội vừa chính thức đồng ý phương án áp mức thuế không phẩy hai phần trăm đối với đất bỏ hoang...',
        timestamp: Date.now(),
      };
    }
  } catch (e) {}

  return {
    lastJob: defaultLastJob,
    customDirectives: [
      'Tin chính sách, thuế, phí: BẮT BUỘC nêu rõ mốc thời gian có hiệu lực / lộ trình thực thi (ví dụ: áp dụng từ 1/7/2027), số liệu định lượng cụ thể 0,2%.',
      'Tuyệt đối không dùng từ khẩn cấp trong hook mở đầu, ưu tiên Tin nóng!',
      'Tin thời tiết: Trung thực mức độ lạnh, không tự ý nâng lên thành rét đậm rét hại hay cực mạnh.',
    ],
  };
}

/**
 * Lưu bộ nhớ bot vào videos/.bot-memory.json
 */
export function saveBotMemory(memory) {
  try {
    const dir = path.dirname(BOT_MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BOT_MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[BotBrain] Lỗi ghi bộ nhớ bot:', e.message);
  }
}

/**
 * Cập nhật công việc gần nhất sau khi render video xong
 */
export function updateLastJob(jobData) {
  const memory = loadBotMemory();
  memory.lastJob = {
    ...jobData,
    timestamp: Date.now(),
  };
  saveBotMemory(memory);
  return memory.lastJob;
}

/**
 * Thêm quy tắc/chỉ đạo lâu dài từ chủ kênh
 */
export function addCustomDirective(directive) {
  const memory = loadBotMemory();
  const clean = directive.trim();
  if (clean && !memory.customDirectives.includes(clean)) {
    memory.customDirectives.push(clean);
    saveBotMemory(memory);
    return true;
  }
  return false;
}

/**
 * Xóa một quy tắc theo chỉ số (1-based index)
 */
export function removeCustomDirective(index1Based) {
  const memory = loadBotMemory();
  const idx = index1Based - 1;
  if (idx >= 0 && idx < memory.customDirectives.length) {
    const removed = memory.customDirectives.splice(idx, 1);
    saveBotMemory(memory);
    return removed[0];
  }
  return null;
}

/**
 * Xóa toàn bộ quy tắc tuỳ chỉnh
 */
export function clearCustomDirectives() {
  const memory = loadBotMemory();
  memory.customDirectives = [];
  saveBotMemory(memory);
  return true;
}

/**
 * Phân tích tin nhắn người dùng bằng heuristic dự phòng khi offline hoặc AI bận
 */
export function fallbackAnalyzeMessage(text, lastJob) {
  const lower = text.toLowerCase().trim();

  // 1. Quét tin tức mới / Trend
  if (
    lower === 'trend' ||
    lower === 'trends' ||
    lower.includes('tin mới') ||
    lower.includes('có gì mới') ||
    lower.includes('có tin mới') ||
    lower.includes('có tin gì mới') ||
    lower.includes('tin hot') ||
    lower.includes('tin nóng') ||
    lower.includes('xu hướng')
  ) {
    return {
      intent: 'TREND_QUERY',
      replyText: '🔍 <i>Đang quét và tổng hợp các tin hot, xu hướng mới nhất từ mạng xã hội cho bạn...</i>',
    };
  }

  // 2. Lưu quy tắc chỉ đạo lâu dài
  if (
    lower.startsWith('từ nay') ||
    lower.startsWith('quy tắc') ||
    lower.startsWith('luôn nhớ') ||
    lower.startsWith('dặn này') ||
    lower.startsWith('lưu ý:')
  ) {
    const directive = text.replace(/^(?:quy tắc|lưu ý|dặn này)[\s:]*/i, '').trim();
    return {
      intent: 'SAVE_DIRECTIVE',
      directive: directive || text,
      replyText: `📌 <b>Đã ghi nhớ quy tắc mới của chủ kênh:</b>\n<i>"${directive || text}"</i>\n👉 Hệ thống sẽ áp dụng nguyên tắc này vào tất cả các video từ nay về sau!`,
    };
  }

  // 3. Phản hồi / Báo lỗi / Yêu cầu sửa kịch bản & làm lại video gần nhất
  const isFeedbackWord =
    lower.includes('sai') ||
    lower.includes('sửa') ||
    lower.includes('chỉnh') ||
    lower.includes('làm lại') ||
    lower.includes('thiếu') ||
    lower.includes('thay') ||
    lower.includes('đổi') ||
    lower.includes('bỏ') ||
    lower.includes('nói quá') ||
    lower.includes('thêm') ||
    lower.includes('kém') ||
    lower.includes('chậm') ||
    lower.includes('nhanh') ||
    lower.includes('viết lại') ||
    lower.includes('chưa chuẩn') ||
    lower.includes('không đúng') ||
    lower.includes('báo không nói') ||
    lower.includes('đoạn');

  const durationMatch = text.match(/(\d{2})\s*(?:s|giây|sec)/i);
  const targetDuration = durationMatch ? parseInt(durationMatch[1], 10) : null;
  const refreshImages = lower.includes('đổi ảnh') || lower.includes('thay ảnh') || lower.includes('ảnh mới');

  if (lastJob && (isFeedbackWord || text.length >= 8)) {
    return {
      intent: 'REMAKE_WITH_FEEDBACK',
      feedback: text,
      targetDuration,
      refreshImages,
      replyText: `🤖 <b>Đã tiếp nhận phản hồi của bạn:</b>\n<i>"${text}"</i>\n\n⚡ <b>Đang sửa lại kịch bản và kết xuất video mới theo đúng góp ý của bạn ngay lập tức...</b>`,
    };
  }

  // 4. Nếu là đoạn văn bản tin tức dài người dùng dán vào để tạo video
  if (text.length >= 25 && !text.includes('?')) {
    return {
      intent: 'MAKE_VIDEO_TEXT',
      content: text,
      targetDuration: targetDuration || 38,
      replyText: '🎬 <b>Đã nhận nội dung tin tức bạn gửi!</b> Đang chuẩn bị kịch bản và dựng video ngay...',
    };
  }

  // 5. Trò chuyện / Thắc mắc / Câu hỏi
  return {
    intent: 'CHAT_OR_QUESTION',
    replyText:
      `👋 <b>Chào bạn! Tôi là Trợ lý Biên tập AI của Hóng Hớt 24/7.</b>\n\n` +
      `💡 <b>Bạn có thể:</b>\n` +
      `- Gửi <b>link bài báo</b> để làm video mới.\n` +
      `- Nhắn <b>phản hồi / báo lỗi</b> (ví dụ: <i>"video vừa rồi thiếu mốc 1/7/2027", "bỏ từ khẩn cấp", "sửa lại 30s"</i>) để tôi sửa kịch bản và render lại ngay!\n` +
      `- Dặn dò quy tắc: <i>"Từ nay về sau..."</i> để tôi ghi nhớ lâu dài.`,
  };
}

/**
 * Phân tích tin nhắn người dùng bằng Gemini AI (NLU cao cấp)
 */
export async function analyzeUserMessage(userMessage, aiInstance = null) {
  const memory = loadBotMemory();
  const lastJob = memory.lastJob;

  if (!aiInstance) {
    return fallbackAnalyzeMessage(userMessage, lastJob);
  }

  const prompt = `Bạn là hệ thống hiểu ngôn ngữ tự nhiên (NLU) cho Telegram Bot của kênh tin tức mạng xã hội "HÓNG HỚT 24/7".
Chủ kênh đang dùng điện thoại nhắn tin cho Bot. Hãy phân tích tin nhắn của chủ kênh và quyết định hành động phù hợp nhất.

BỐI CẢNH BÀI BÁO / VIDEO GẦN NHẤT VỪA TẠO (NẾU CÓ):
- Tiêu đề: ${lastJob ? lastJob.articleTitle : 'Chưa có'}
- Nguồn: ${lastJob ? lastJob.articleDomain : 'Chưa có'}
- Tóm tắt kịch bản vừa tạo: ${lastJob ? lastJob.scriptSummary : 'Chưa có'}
- Link / Nội dung: ${lastJob ? (lastJob.urlOrText || '').slice(0, 200) : 'Chưa có'}
- Các quy tắc đã lưu: ${memory.customDirectives.length > 0 ? memory.customDirectives.join('; ') : 'Chưa có'}

TIN NHẮN CỦA CHỦ KÊNH:
"${userMessage}"

HÃY PHÂN LOẠI TIN NHẮN VÀO 1 TRONG 5 Ý ĐỊNH (INTENTS):

1. "REMAKE_WITH_FEEDBACK":
   - Khi chủ kênh phản hồi, phê bình, báo lỗi, nhận xét điểm chưa đúng, hoặc yêu cầu chỉnh sửa/làm lại video vừa làm theo ý họ!
   - Ví dụ:
     * "video vừa rồi sai mốc thời gian, sửa lại thành 1/7/2027 đi"
     * "nói quá rồi, bài báo chỉ nói trời rét sao lại bảo rét đậm rét hại"
     * "bỏ từ khẩn cấp đi"
     * "làm lại video vừa rồi nhưng rút ngắn 30s thôi"
     * "ảnh xấu quá, đổi ảnh khác"
     * "viết lại đoạn kết kêu gọi follow hay hơn"
     * "thiếu ý mức phạt 77 triệu, thêm vào"
     * "bạn làm sai tôi nhắn báo lỗi bạn ko fix"
   - output:
     * intent: "REMAKE_WITH_FEEDBACK"
     * feedback: Tóm tắt điểm cốt lõi cần sửa một cách ngắn gọn, rõ ràng và đắt giá.
     * targetDuration: Số giây nếu người dùng muốn đổi (ví dụ 30, 45), hoặc null nếu giữ nguyên.
     * refreshImages: true nếu người dùng muốn đổi ảnh / thay ảnh / ảnh mới, ngược lại false.
     * replyText: Lời phản hồi kính cẩn, lễ phép, xác nhận đã hiểu rõ lỗi cần sửa và thông báo đang tiến hành sửa kịch bản làm lại video ngay.

2. "SAVE_DIRECTIVE":
   - Khi chủ kênh đưa ra một quy tắc / dặn dò mang tính lâu dài cho tất cả các video từ nay về sau.
   - Ví dụ:
     * "từ nay về sau tin chính sách nhớ thêm mốc thời gian nhé"
     * "đừng bao giờ dùng từ cực mạnh nữa"
     * "luôn để hashtag #vietnam nhé"
   - output:
     * intent: "SAVE_DIRECTIVE"
     * directive: Nội dung quy tắc cần ghi nhớ
     * replyText: Lời xác nhận đã lưu quy tắc này vào hệ thống và sẽ áp dụng cho tất cả video tương lai.

3. "MAKE_VIDEO_TEXT":
   - Khi chủ kênh gửi hoặc copy một đoạn tin tức, văn bản bài báo dài (không có link url) để làm video.
   - output:
     * intent: "MAKE_VIDEO_TEXT"
     * content: Toàn bộ nội dung tin tức cần dựng video
     * targetDuration: Thời lượng mong muốn nếu có (mặc định 38)
     * replyText: Lời xác nhận tiếp nhận nội dung và bắt đầu dựng video.

4. "TREND_QUERY":
   - Khi chủ kênh hỏi tin mới, tin hot, trend hôm nay ("có tin gì mới ko", "tin nóng", "trend hôm nay",...).
   - output:
     * intent: "TREND_QUERY"
     * replyText: Lời xác nhận bắt đầu quét tin nóng.

5. "CHAT_OR_QUESTION":
   - Khi chủ kênh hỏi thăm, hỏi về cách hoạt động của hệ thống, hỏi về kịch bản vừa tạo, hỏi tại sao video lại như thế, hoặc trò chuyện thông thường.
   - output:
     * intent: "CHAT_OR_QUESTION"
     * replyText: Câu trả lời thông minh, thấu hiểu, cung cấp thông tin giải thích cặn kẽ và chuyên nghiệp.

TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON (không kèm markdown \`\`\`json):
{
  "intent": "REMAKE_WITH_FEEDBACK" | "SAVE_DIRECTIVE" | "MAKE_VIDEO_TEXT" | "TREND_QUERY" | "CHAT_OR_QUESTION",
  "feedback": "...",
  "targetDuration": null,
  "refreshImages": false,
  "directive": "...",
  "content": "...",
  "replyText": "..."
}`;

  const models = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-pro-latest',
  ];

  for (const m of models) {
    try {
      const res = await aiInstance.models.generateContent({
        model: m,
        contents: prompt,
      });
      if (res && res.text) {
        let clean = res.text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(clean);
        if (parsed.intent) return parsed;
      }
    } catch (e) {
      console.warn(`[BotBrain] Model ${m} bận:`, e.message?.slice(0, 80));
    }
  }

  return fallbackAnalyzeMessage(userMessage, lastJob);
}
