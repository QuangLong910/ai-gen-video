/**
 * scripts/tts.mjs
 *
 * Text-to-Speech synthesis for the video pipeline.
 *
 * Usage:
 *   node scripts/tts.mjs "videos/<slug>/script/script.json" "<slug>" [--force]
 *
 * TTS provider selection (in priority order):
 *   1. ElevenLabs  — if ELEVENLABS_API_KEY is set (primary)
 *   2. Gemini TTS  — if GEMINI_API_KEY is set (fallback, auto-cascades through models:
 *                     gemini-2.5-flash-preview-tts -> gemini-3.1-flash-tts ->
 *                     gemini-3.8-flash-lite-tts -> gemini-3.8-flash-tts)
 *
 * Voice ID resolution (ElevenLabs):
 *   1. Template voice config  — from src/templates/registry.ts (if --template was used)
 *   2. ELEVENLABS_VOICE_ID    — from .env
 *   3. Built-in default       — hardcoded fallback
 *
 * Output: public/<slug>/voice.mp3
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env manually (no dotenv dependency needed in scripts) ──────────────
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
const [, , scriptJsonPath, slug, ...flags] = process.argv;
const force = flags.includes('--force');
const unknownFlags = flags.filter((flag) => flag !== '--force');

if (!scriptJsonPath || !slug || unknownFlags.length > 0) {
  console.error('Usage: node scripts/tts.mjs <script.json path> <slug> [--force]');
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag(s): ${unknownFlags.join(', ')}`);
  }
  process.exit(1);
}

// ─── Read script ──────────────────────────────────────────────────────────────
if (!fs.existsSync(scriptJsonPath)) {
  console.error(`Error: script.json not found at ${scriptJsonPath}`);
  process.exit(1);
}

const scriptData = JSON.parse(fs.readFileSync(scriptJsonPath, 'utf-8'));
const scriptList = scriptData.scenes || scriptData.script || scriptData.segments || [];
const rawText = Array.isArray(scriptList) ? scriptList.map((s) => s.text).join(' ') : (scriptData.fullText || '');
// Chuẩn hóa phát âm tự nhiên tiếng Việt cho TTS (24/7 đọc là "hai tư trên bảy")
const fullText = rawText
  .replace(/24\/7/gi, 'hai tư trên bảy')
  .replace(/24-7/gi, 'hai tư trên bảy')
  .replace(/Cây Cày/g, 'cây cày')
  .replace(/Cây cày/g, 'cây cày');

if (!fullText.trim()) {
  console.error('Error: script.json contains no text');
  process.exit(1);
}

// ─── Resolve template voice config ───────────────────────────────────────────
/**
 * If this slug was generated with --template, read the templateId from
 * videos/<slug>/template.txt and look up voice config from registry.ts.
 *
 * Registry is a TypeScript file so we parse it as text instead of importing.
 * We extract the voice block for the matching template ID using regex.
 *
 * Returns { elevenLabsVoiceId?, geminiVoice? } or {}
 */
function resolveTemplateVoice(slug) {
  // Check if this video is explicitly designated for a specific channel
  const channelTxtPath = path.join(ROOT, 'videos', slug, 'channel.txt');
  if (fs.existsSync(channelTxtPath)) {
    const channelId = fs.readFileSync(channelTxtPath, 'utf-8').trim().toLowerCase();
    if (channelId === 'k2') {
      console.error(`📺  Channel config detected: "k2" (Tâm Điểm Túc Cầu - Giọng Nam)`);
      return {
        geminiVoice: 'Puck', // Giọng Nam thể thao
        elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
      };
    }
  }

  const templateTxtPath = path.join(ROOT, 'videos', slug, 'template.txt');
  if (!fs.existsSync(templateTxtPath)) {
    return {}; // flexible mode — no template
  }

  const templateId = fs.readFileSync(templateTxtPath, 'utf-8').trim();
  if (!templateId) return {};

  const registryPath = path.join(ROOT, 'src', 'templates', 'registry.ts');
  if (!fs.existsSync(registryPath)) return {};

  try {
    const registrySource = fs.readFileSync(registryPath, 'utf-8');

    // Find the registry entry block for this templateId
    // Look for the id: '<templateId>' and extract the surrounding object
    const idPattern = new RegExp(
      `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`]`,
    );

    if (!idPattern.test(registrySource)) {
      console.error(`⚠️  Template "${templateId}" not found in registry — using default voice`);
      return {};
    }

    // Extract elevenLabsVoiceId if present
    const elevenMatch = registrySource.match(
      new RegExp(
        `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`][^}]*?elevenLabsVoiceId:\\s*['"\`]([^'"\`]+)['"\`]`,
        's',
      ),
    );

    // Extract geminiVoice if present
    const geminiMatch = registrySource.match(
      new RegExp(
        `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`][^}]*?geminiVoice:\\s*['"\`]([^'"\`]+)['"\`]`,
        's',
      ),
    );

    const voice = {};
    if (elevenMatch?.[1]) voice.elevenLabsVoiceId = elevenMatch[1];
    if (geminiMatch?.[1]) voice.geminiVoice = geminiMatch[1];

    if (Object.keys(voice).length > 0) {
      console.error(`🎭  Template voice config found for "${templateId}":`);
      if (voice.elevenLabsVoiceId) console.error(`   ElevenLabs: ${voice.elevenLabsVoiceId}`);
      if (voice.geminiVoice)       console.error(`   Gemini:     ${voice.geminiVoice}`);
    }

    return voice;
  } catch (err) {
    console.error(`⚠️  Could not read template voice config: ${err.message}`);
    return {};
  }
}

const templateVoice = resolveTemplateVoice(slug);

// ─── Output path ─────────────────────────────────────────────────────────────
const outputDir = path.join(ROOT, 'public', slug);
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'voice.mp3');

if (fs.existsSync(outputPath) && !force) {
  console.error(`♻️  Reusing existing voice.mp3 at ${outputPath}`);
  console.error('   Pass --force only for an explicit user-approved voice regeneration.');
  console.log(outputPath);
  process.exit(0);
}

// ─── Gemini TTS ───────────────────────────────────────────────────────────────

// Helper to split long text into sentence-aware chunks for TTS models
function splitIntoChunks(text, maxChars = 1800) {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).trim().length > maxChars && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? (currentChunk + ' ' + sentence) : sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// ─── Gemini TTS ───────────────────────────────────────────────────────────────
const GEMINI_TTS_MODELS = [
  'gemini-3.8-flash-tts',
  'gemini-2.5-flash-preview-tts',
  'gemini-3.8-flash-lite-tts',
];

async function generateWithGemini(narration, outPath) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Priority: template voice config → .env GEMINI_TTS_VOICE → default
  const voice = templateVoice.geminiVoice || process.env.GEMINI_TTS_VOICE || 'Achird';

  console.error('🎙  TTS provider: Gemini (fallback)');
  console.error(`   Voice: ${voice}`);

  // Lazy-import so the package is only required when Gemini is actually used
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const envModel = process.env.GEMINI_TTS_MODEL?.trim();
  const modelsToTry = envModel
    ? [envModel, ...GEMINI_TTS_MODELS.filter((m) => m !== envModel)]
    : [...GEMINI_TTS_MODELS];

  let lastError = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    console.error(`   [Gemini TTS] Attempting model (${i + 1}/${modelsToTry.length}): ${model}…`);

    try {
      const chunks = splitIntoChunks(narration, 1800);
      console.error(`   [Gemini TTS] Text length: ${narration.length} chars (${chunks.length} chunks)`);
      const pcmBuffers = [];

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkText = chunks[cIdx];
        if (chunks.length > 1) {
          console.error(`   [Gemini TTS] Synthesizing chunk ${cIdx + 1}/${chunks.length} (${chunkText.length} chars)…`);
        }

        let retries = 0;
        let response = null;
        while (retries < 3) {
          try {
            response = await ai.models.generateContent({
              model,
              contents: [{ parts: [{ text: chunkText }] }],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice },
                  },
                },
              },
            });
            break;
          } catch (chunkErr) {
            const errMsg = String(chunkErr.message || chunkErr);
            if (errMsg.includes('per day limit exceeded') || errMsg.includes('PerDay')) {
              console.error(`   ⚠️ [Gemini TTS] Daily quota exceeded for ${model}, switching model immediately…`);
              throw chunkErr;
            }
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
              // Extract retryDelay if available (e.g. "retryDelay":"30s" or "30.2s")
              const delayMatch = errMsg.match(/retry(?:Delay| in )[:\s]*(\d+(?:\.\d+)?)s?/i);
              const waitSec = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) + 2 : 25;
              if (waitSec > 35) {
                console.error(`   ⚠️ [Gemini TTS] Wait time ${waitSec}s too long for ${model}, switching model…`);
                throw chunkErr;
              }
              console.error(`   ⏳ [Gemini TTS] Rate limited (RPM). Waiting ${waitSec}s before retrying chunk ${cIdx + 1}…`);
              await new Promise((r) => setTimeout(r, waitSec * 1000));
              retries++;
            } else {
              throw chunkErr;
            }
          }
        }

        if (!response) {
          throw new Error(`Gemini TTS chunk ${cIdx + 1} failed after retries with model "${model}"`);
        }

        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!data) {
          throw new Error(`Gemini TTS returned no audio data with model "${model}" on chunk ${cIdx + 1}`);
        }
        const chunkBuf = Buffer.from(data, 'base64');
        if (chunkBuf.length === 0) {
          throw new Error(`Gemini TTS returned empty PCM buffer with model "${model}" on chunk ${cIdx + 1}`);
        }
        pcmBuffers.push(chunkBuf);

        // Pause slightly between chunks to stay under RPM limits
        if (cIdx < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Concatenate raw PCM buffers: 24 kHz, 16-bit signed LE, mono
      const pcmBuffer = Buffer.concat(pcmBuffers);

      console.error(`   PCM buffer: ${(pcmBuffer.length / 1024).toFixed(1)} KB — converting to MP3 via ffmpeg…`);

      // Convert PCM → MP3 by piping into ffmpeg stdin
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-y',                  // overwrite output
          '-f', 's16le',         // input format: signed 16-bit little-endian PCM
          '-ar', '24000',        // sample rate: 24 kHz
          '-ac', '1',            // channels: mono
          '-i', 'pipe:0',        // read from stdin
          '-codec:a', 'libmp3lame',
          '-q:a', '2',           // VBR quality ~190 kbps
          outPath,
        ], { stdio: ['pipe', 'inherit', 'inherit'] });

        ff.on('error', (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
        ff.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });

        ff.stdin.write(pcmBuffer);
        ff.stdin.end();
      });

      const stat = fs.statSync(outPath);
      console.error(`   ✅ Saved to ${outPath} (${(stat.size / 1024).toFixed(1)} KB) using ${model}`);
      return;
    } catch (err) {
      lastError = err;
      console.error(`   ⚠️  Gemini model "${model}" failed: ${err.message}`);
      if (i < modelsToTry.length - 1) {
        console.error(`   🔄 Switching to next Gemini model: ${modelsToTry[i + 1]}…`);
      }
    }
  }

  console.error('\n' + '='.repeat(70));
  console.error('🚨 [Gemini TTS] TẤT CẢ CÁC MODEL GEMINI TTS ĐỀU ĐÃ THỬ NHƯNG THẤT BẠI!');
  console.error(`   Các model đã thử: ${modelsToTry.join(' ➔ ')}`);
  console.error('👉 Vui lòng đổi GEMINI_API_KEY mới để tiếp tục bằng lệnh:');
  console.error('   /update-config --key GEMINI_API_KEY --value <api_key_moi>');
  console.error('='.repeat(70) + '\n');

  throw new Error(`All Gemini TTS models failed (${modelsToTry.join(', ')}). Last error: ${lastError?.message}`);
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────
async function generateWithElevenLabs(narration, outPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  // Priority: template voice config → .env ELEVENLABS_VOICE_ID → built-in default
  const voiceId = templateVoice.elevenLabsVoiceId
    || process.env.ELEVENLABS_VOICE_ID
    || 'K7ewtjKRNtwwt3lKQ6M0'; // default fallback

  console.error('🎙  TTS provider: ElevenLabs');
  console.error(`   Voice ID: ${voiceId}${templateVoice.elevenLabsVoiceId ? ' (from template)' : ''}`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: narration,
      model_id: 'eleven_v3',
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('ElevenLabs returned empty audio');
  }

  fs.writeFileSync(outPath, buffer);
  console.error(`   ✅ Saved to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

// ─── Router ───────────────────────────────────────────────────────────────────
console.error(`\n📝 Script text (${fullText.length} chars):`);
console.error(`   "${fullText.slice(0, 80)}${fullText.length > 80 ? '...' : ''}"`);

if (process.env.ELEVENLABS_API_KEY) {
  try {
    await generateWithElevenLabs(fullText, outputPath);
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    console.error(`\n⚠️  ElevenLabs TTS failed: ${err.message} — falling back to Gemini`);
  }
}

if (process.env.GEMINI_API_KEY) {
  try {
    await generateWithGemini(fullText, outputPath);
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    console.error(`\n⚠️  Gemini TTS failed: ${err.message}`);
  }
}

console.error('\n' + '='.repeat(70));
console.error('🚨 THÔNG BÁO: HẾT QUOTA / TOÀN BỘ PROVIDER VÀ MODEL TTS ĐỀU THẤT BẠI!');
console.error('👉 Vui lòng đổi hoặc bổ sung API Key mới để tiếp tục tạo video:');
console.error('   • Đổi Gemini API Key:');
console.error('     /update-config --key GEMINI_API_KEY --value <api_key_moi>');
console.error('   • Hoặc bổ sung ElevenLabs API Key:');
console.error('     /update-config --key ELEVENLABS_API_KEY --value <api_key_moi>');
console.error('='.repeat(70) + '\n');
process.exit(1);
