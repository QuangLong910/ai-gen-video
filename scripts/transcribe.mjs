/**
 * scripts/transcribe.mjs
 *
 * Transcribe audio with word/segment-level timestamps.
 *
 * Provider selection:
 *   1. Groq Whisper — if GROQ_API_KEY is set (primary)
 *   2. api.stt.ai   — if STT_API_KEY is set (fallback)
 *
 * Usage:
 *   node scripts/transcribe.mjs "<slug>"
 *
 * Input:  public/<slug>/voice.mp3
 * Output: public/<slug>/timeline.json
 *
 * Output format (timeline.json):
 * {
 *   "duration": 68.4,
 *   "segments": [
 *     { "start": 0.0, "end": 1.9, "text": "Ây, ai viết code nhanh như rocket," }
 *   ],
 *   "words": [
 *     { "word": "Ây,", "start": 0.0, "end": 0.2 }
 *   ]
 * }
 *
 * Segments drive scene timing. Words are required for subtitle highlighting.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ─── Args ─────────────────────────────────────────────────────────────────────
const [, , slug] = process.argv;

if (!slug) {
  console.error('Usage: node scripts/transcribe.mjs <slug>');
  process.exit(1);
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const audioPath = path.join(ROOT, 'public', slug, 'voice.mp3');
const outputPath = path.join(ROOT, 'public', slug, 'timeline.json');

let scriptText = '';
const scriptFile = path.join(ROOT, 'videos', slug, 'script', 'script.json');
if (fs.existsSync(scriptFile)) {
  try {
    const sData = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));
    if (Array.isArray(sData.script)) {
      scriptText = sData.script.map((s) => s.text).join('\n');
    }
  } catch (e) {}
}

if (!fs.existsSync(audioPath)) {
  console.error(`Error: voice.mp3 not found at ${audioPath}`);
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const sttApiKey = process.env.STT_API_KEY;
const language = process.env.STT_LANGUAGE || 'vi';

if (!groqApiKey && !sttApiKey) {
  console.error('Error: set GROQ_API_KEY or STT_API_KEY in .env');
  process.exit(1);
}

function validateTimeline(timeline) {
  if (!timeline.segments || !Array.isArray(timeline.segments) || timeline.segments.length === 0) {
    throw new Error('STT provider returned no segments');
  }

  if (!Array.isArray(timeline.words)) {
    timeline.words = [];
  }

  if (timeline.duration === null || timeline.duration === undefined) {
    const lastSegment = timeline.segments[timeline.segments.length - 1];
    const lastWord = timeline.words[timeline.words.length - 1];
    timeline.duration = Math.max(lastSegment?.end ?? 0, lastWord?.end ?? 0);
  }

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    if (typeof seg.start !== 'number' || typeof seg.end !== 'number') {
      throw new Error(`Invariant violation: segment[${i}] has invalid timestamps`);
    }
    if (seg.start > seg.end) {
      throw new Error(`Invariant violation: segment[${i}].start (${seg.start}) > end (${seg.end})`);
    }
    if (i > 0 && seg.start < timeline.segments[i - 1].start) {
      throw new Error(`Invariant violation: segment[${i}].start (${seg.start}) < segment[${i - 1}].start`);
    }
  }

  for (let i = 0; i < timeline.words.length; i++) {
    const w = timeline.words[i];
    if (typeof w.start !== 'number' || typeof w.end !== 'number') {
      throw new Error(`Invariant violation: word[${i}] "${w.word}" has invalid timestamps`);
    }
    if (w.start > w.end) {
      w.end = w.start;
    }
    if (i > 0 && w.start < timeline.words[i - 1].start) {
      w.start = timeline.words[i - 1].start;
    }
  }

  return timeline;
}

function normalizeGroqResponse(data) {
  const segments = Array.isArray(data.segments)
    ? data.segments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: String(seg.text ?? '').trim(),
      }))
    : [];

  const words = Array.isArray(data.words)
    ? data.words.map((word) => ({
        word: String(word.word ?? '').trim(),
        start: word.start,
        end: word.end,
      }))
    : [];

  return validateTimeline({
    duration: data.duration ?? null,
    segments,
    words,
  });
}

function normalizeSttAiResponse(data) {
  const allWords = [];

  const timeline = {
    duration: data.duration ?? null,
    segments: Array.isArray(data.segments)
      ? data.segments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: String(seg.text ?? '').trim(),
        }))
      : [],
    words: [],
  };

  for (const seg of data.segments ?? []) {
    if (Array.isArray(seg.words) && seg.words.length > 0) {
      for (const w of seg.words) {
        allWords.push({
          word: String(w.word ?? '').trim(),
          start: w.start,
          end: w.end,
        });
      }
    }
  }

  timeline.words = allWords;
  return validateTimeline(timeline);
}

async function transcribeWithGroq() {
  console.log('   Provider: Groq');
  console.log(`   Model:    ${groqModel}`);

  const audioBuffer = fs.readFileSync(audioPath);
  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.mp3');
      formData.append('model', groqModel);
      formData.append('language', language);
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0');
      formData.append('timestamp_granularities[]', 'word');
      formData.append('timestamp_granularities[]', 'segment');
      formData.append('prompt', 'Hóng Hớt 24/7, thời sự, tin tức, Việt Nam');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq STT API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return normalizeGroqResponse(data);
    } catch (err) {
      lastErr = err;
      console.warn(`   ⚠️  Groq attempt ${attempt}/3 failed: ${err.message}. Retrying...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  throw lastErr;
}

async function transcribeWithSttAi() {
  console.log('   Provider: api.stt.ai');

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('file', audioBlob, 'voice.mp3');
  formData.append('language', language);
  formData.append('speakers', '1');

  const response = await fetch('https://api.stt.ai/v1/transcribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sttApiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`api.stt.ai error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return normalizeSttAiResponse(data);
}

async function transcribe() {
  if (groqApiKey) {
    try {
      return await transcribeWithGroq();
    } catch (err) {
      if (!sttApiKey) {
        throw err;
      }
      console.error(`\n⚠️  Groq STT failed: ${err.message}`);
      console.error('   Falling back to api.stt.ai');
    }
  }

  if (sttApiKey) {
    return transcribeWithSttAi();
  }

  throw new Error('No STT provider available');
}

function applyReplacements(timeline, replacements) {
  for (const seg of timeline.segments) {
    for (const { find, replace } of replacements) {
      const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      seg.text = seg.text.replace(regex, replace);
    }
  }

  for (const { find, replace } of replacements) {
    const findTokens = find.trim().split(/\s+/).map((t) => t.toLowerCase());
    const replaceTokens = replace.trim().split(/\s+/);

    for (let i = 0; i <= timeline.words.length - findTokens.length; i++) {
      let match = true;
      for (let j = 0; j < findTokens.length; j++) {
        const w = timeline.words[i + j].word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (w !== findTokens[j].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')) {
          match = false;
          break;
        }
      }

      if (match) {
        if (findTokens.length === replaceTokens.length) {
          for (let j = 0; j < findTokens.length; j++) {
            const orig = timeline.words[i + j].word;
            const puncMatch = orig.match(/[.,!?]+$/);
            const punc = puncMatch ? puncMatch[0] : '';
            timeline.words[i + j].word = replaceTokens[j] + punc;
          }
        } else {
          const start = timeline.words[i].start;
          const end = timeline.words[i + findTokens.length - 1].end;
          const dur = (end - start) / replaceTokens.length;
          const newWords = replaceTokens.map((w, idx) => ({
            word: w + (idx === replaceTokens.length - 1 ? (timeline.words[i + findTokens.length - 1].word.match(/[.,!?]+$/)?.[0] || '') : ''),
            start: Number((start + idx * dur).toFixed(2)),
            end: Number((start + (idx + 1) * dur).toFixed(2)),
          }));
          timeline.words.splice(i, findTokens.length, ...newWords);
        }
        i += replaceTokens.length - 1;
      }
    }
  }
}

async function proofreadTimeline(timeline, script) {
  if (!script || !groqApiKey) return;

  console.log('\n🔍 Rà soát & chuẩn hóa chính tả phụ đề (Subtitles Proofreading)...');
  const sttText = timeline.segments.map((s) => s.text).join('\n');

  const prompt = `Bạn là chuyên gia rà soát phụ đề (Subtitles Proofreader) tiếng Việt cho video ngắn.
Dưới đây là KỊCH BẢN GỐC CHUẨN CHÍNH TẢ và VĂN BẢN PHỤ ĐỀ STT TỰ ĐỘNG.

Quy tắc rà soát:
1. SỬA TOÀN BỘ lỗi chính tả, từ nghe nhầm (VD: "cô lộc bộ" / "cô lạc bộ" -> "câu lạc bộ", "giàn cầu thủ" -> "dàn cầu thủ", "Hỗn luyện viên" -> "Huấn luyện viên").
2. SỬA phiên âm sai tên riêng, giải đấu, địa danh (VD: "Kaspar" -> "Casper", "Kim Sang Sích" -> "Kim Sang-sik").
3. VIẾT HOA danh từ riêng chuẩn mực (VD: "tiền phong" -> "Tiền Phong", "sao vàng" -> "Sao Vàng", "hóng hớt" -> "Hóng Hớt 24/7").
4. GIỮ NGUYÊN các con số hiển thị ngắn gọn trực quan trên màn hình (như "19h", "17 tháng 11", "3 điểm", "4 trụ cột", "2026"). KHÔNG đổi thành chữ viết dài dòng.

Trả về DUY NHẤT một JSON array các cặp thay thế dạng:
[
  { "find": "từ_hoặc_cụm_từ_sai_trong_stt", "replace": "từ_hoặc_cụm_từ_đã_sửa_chuẩn" }
]
Chỉ trả về JSON thuần túy, không bọc markdown, không giải thích.

KỊCH BẢN GỐC:
${script}

VĂN BẢN PHỤ ĐỀ STT:
${sttText}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return;
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);

    const replacements = JSON.parse(text.trim());
    if (Array.isArray(replacements) && replacements.length > 0) {
      console.log(`   ✍️  Phát hiện ${replacements.length} điểm cần hiệu đính chính tả:`);
      for (const r of replacements) {
        console.log(`      • "${r.find}" ➔ "${r.replace}"`);
      }
      applyReplacements(timeline, replacements);
      console.log('   ✅ Đã chuẩn hóa chính tả phụ đề thành công!');
    } else {
      console.log('   ✅ Chính tả phụ đề đã khớp chuẩn kịch bản gốc.');
    }
  } catch (err) {
    console.warn(`   ⚠️  Bỏ qua bước rà soát phụ đề: ${err.message}`);
  }
}

// ─── Transcribe ───────────────────────────────────────────────────────────────
console.log(`\n🎧 Transcribing: ${audioPath}`);
console.log(`   Language: ${language}`);

try {
  const timeline = await transcribe();

  // ─── Auto Proofread Subtitles with Script ─────────────────────────────────────
  await proofreadTimeline(timeline, scriptText);

  // ─── Write output ───────────────────────────────────────────────────────────
  fs.writeFileSync(outputPath, JSON.stringify(timeline, null, 2), 'utf-8');

  console.log(`\n✅ Transcription complete`);
  console.log(`   Segments: ${timeline.segments.length}`);
  console.log(`   Words:    ${timeline.words.length}`);
  console.log(`   Duration: ${timeline.duration}s`);
  console.log(`   Output:   ${outputPath}`);

  // Print segment summary
  console.log('\n📋 Segments:');
  for (const seg of timeline.segments) {
    const dur = (seg.end - seg.start).toFixed(2);
    console.log(`   [${seg.start.toFixed(2)}s – ${seg.end.toFixed(2)}s | ${dur}s] "${seg.text.slice(0, 60)}${seg.text.length > 60 ? '...' : ''}"`);
  }

} catch (err) {
  console.error(`\n❌ Transcription failed: ${err.message}`);
  process.exit(1);
}
