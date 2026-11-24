# Agent Instructions

This project provides eleven commands that any AI coding agent can execute.
All workflow documentation lives in `docs/` — read it before executing any command.

---

## Commands

### `/setup`
Automatically installs all dependencies and configures the environment.
Full instructions: [docs/SKILL-SETUP.md](docs/SKILL-SETUP.md)

### `/gen-video [--template <template-id>] [--audio=<mode>] <context>`
Generates a short-form video from text context using Remotion + AI voiceover.
`<mode>` is `full`, `music`, `sfx`, or `voice-only`. When omitted, each
template keeps its existing audio behavior.
Full instructions: [docs/SKILL-GEN-VIDEO.md](docs/SKILL-GEN-VIDEO.md)

### `/templates`
Lists every registered template as a two-column table containing a ready-to-use
command and a short Vietnamese description.
Full instructions: [docs/SKILL-TEMPLATES.md](docs/SKILL-TEMPLATES.md)

### `/update-bg-music --template <template-id-or-name> --music <music-file-or-path>`
Updates one template's configured default background music in
`src/templates/registry.ts`. It searches the selected template's asset manifest
first, then all other asset manifests.
Full instructions: [docs/SKILL-UPDATE-BG-MUSIC.md](docs/SKILL-UPDATE-BG-MUSIC.md)

### `/update-template-voice --template <template-id-or-name> [--gemini <voice-name>] [--elevenlabs <voice-id>]`
Updates one template's configured Gemini and/or ElevenLabs TTS voice in
`src/templates/registry.ts`. At least one provider flag is required; both may be
used in the same command.
Full instructions: [docs/SKILL-UPDATE-TEMPLATE-VOICE.md](docs/SKILL-UPDATE-TEMPLATE-VOICE.md)

### `/add-music --category <name> [--file <filename-or-path>]`
Adds one `.mp3` file from `tmp-music/` to `public/assets/<name>/music/` and
registers it in that category's `manifest.json`. It does not update any
template default.
Full instructions: [docs/SKILL-ADD-MUSIC.md](docs/SKILL-ADD-MUSIC.md)

### `/sync-templates [--package <package-folder>]`
Syncs purchased template packages from `load-templates/` into docs, source,
assets, registry, env config, and npm dependencies. Already-synced packages are
skipped by package ID and version.
Full instructions: [docs/SKILL-SYNC-TEMPLATES.md](docs/SKILL-SYNC-TEMPLATES.md)

### `/update-logo [--file <filename-or-path>]`
Replaces the shared watermark logo at `public/watermark.png` using a `.png`
file from `tmp-logo/`. Full instructions:
[docs/SKILL-UPDATE-LOGO.md](docs/SKILL-UPDATE-LOGO.md)

### `/update-config --key <ENV_KEY> --value <value>`
Updates one key in the project `.env` file without printing secret values. Full
instructions: [docs/SKILL-UPDATE-CONFIG.md](docs/SKILL-UPDATE-CONFIG.md)

### `/update-version`
Reads `update-version/update-version.md`, applies its instructions once, then
marks the file `status: updated`. If already updated, it stops without running.
Full instructions: [docs/SKILL-UPDATE-VERSION.md](docs/SKILL-UPDATE-VERSION.md)

### `/ai-help`
Lists every supported slash command with usage and a short Vietnamese
description. Full instructions: [docs/SKILL-AI-HELP.md](docs/SKILL-AI-HELP.md)

---

## Agent-Specific Entry Points

| Agent | How to load instructions |
|---|---|
| **Kiro** | Auto-loaded from `.kiro/skills/<command>/SKILL.md` → redirects to `docs/` |
| **Cursor** | Auto-loaded from the matching `.cursor/rules/*.mdc` → redirects to `docs/` |
| **Claude Code** | Auto-loaded from the matching `.claude/commands/*.md` → redirects to `docs/` |
| **Gemini (Antigravity)** | Read the matching `docs/SKILL-*.md` directly |
| **Codex (OpenAI)** | Read the matching `docs/SKILL-*.md` directly |

All agents use the canonical sources in `docs/`.

---

## For Gemini and Codex

When the user types `/setup`:
→ Read `docs/SKILL-SETUP.md` and execute every step in order, including its
approval-aware Execution Contract. Treat approvals as pauses inside the same
run, resume automatically after approval, and persist until setup is verified
or a genuine external blocker is reached.

When the user types `/gen-video [--template <template-id>] [--audio=<mode>] <context>` or provides an article URL/request:
→ If no template is specified or when generating news from an article link, use `news/honghot-social` (channel "HÓNG HỚT 24/7", documented in `docs/templates/news/honghot-social.md`).
→ Single-source rule: strictly use ONE single news source per video. Never mix content, quotes, or images from different newspapers into one video.
→ Image scale priority rule: Nếu scale ảnh mà ảnh vẫn đẹp, rõ nét, không vỡ hạt và không bị cắt mất chi tiết quan trọng thì HẠN CHẾ làm mờ viền xung quanh (blur background) mà ƯU TIÊN scale ảnh (hoặc dùng cover/zoom hợp lý) để ảnh hiển thị rộng và ấn tượng nhất.
→ Caption & Hashtag rule: Khi viết caption/mô tả cho video đăng mạng xã hội (TikTok, Reels, Facebook, YouTube Shorts), CHỈ DÙNG TỐI ĐA 5 HASHTAG (chọn lọc 5 hashtag đắt giá, cô đọng và liên quan nhất tới chủ đề/kênh, không spam hashtag).
→ Phonetic voice rule: Với kênh 'Hóng Hớt 24/7', khi đọc lời bình voiceover/TTS bắt buộc phải phát âm là 'Hóng Hớt hai tư trên bảy' (tuyệt đối không đọc là 'hai mươi tư bảy' hay 'hai tư gạch bảy').
→ Audio SFX rule: Tuyệt đối KHÔNG dùng hiệu ứng âm thanh tiếng xé giấy (paper rip / paper tear / page-turn SFX) hoặc nhạc nền có tạp âm xé giấy trong bất kỳ video nào từ nay về sau.
→ Anti-AI Image Rule for Legal/Court/Crime News: Tuyệt đối KHÔNG DÙNG AI (image generator) để tạo ảnh minh họa cho các tin thời sự pháp luật, đại án kinh tế, bắt bớ tội phạm, phiên tòa xét xử hoặc bất kỳ vụ án có nhân vật có thật (tuyệt đối không để AI vẽ mặt bị cáo, vẽ phòng xử án, vẽ công an còng tay). Với các tin pháp luật nhạy cảm, BẮT BUỘC:
  * Dùng ảnh báo chí chính thống chụp thật được đăng tải trên các báo lớn (Dân Trí, Tuổi Trẻ, CAND, VnExpress...).
  * Dùng đồ họa thông tin (Infographics vụ án, sơ đồ dòng tiền, tóm tắt mốc sự kiện, trích dẫn phát ngôn đắt giá) hoặc ảnh chụp trích đoạn bài báo chính thống.
  * Nếu chưa có ảnh thực tế từ phiên tòa, sử dụng motion typography / headline đồ họa tin tức báo chí, tuyệt đối không tạo ảnh AI giả lập nhân thân thực tế.
→ Policy & Effective Date Rule: Với các tin thời sự về chính sách, luật pháp, thuế, phí hoặc quy định mới:
  * BẮT BUỘC nêu rõ mốc thời gian có hiệu lực / lộ trình thực thi (ví dụ: "áp dụng từ 1/7/2027", "có hiệu lực từ đầu năm tới") nếu bài báo có nêu, tuyệt đối không diễn đạt chung chung khiến khán giả hiểu nhầm là áp dụng ngay lập tức.
  * Phải đưa con số định lượng cụ thể (mức thuế, đối tượng áp dụng, điều kiện miễn trừ) thay vì các câu chữ khái quát, sáo rỗng.
→ Official News Fact-Checking & Truth Verification Rule:
  * BẮT BUỘC thực hiện bước kiểm chứng thông tin (Fact-Checking & Truth Verification) đối chiếu trực tiếp với bài báo gốc và các cơ quan báo chí chính thống (VnExpress, Dân Trí, Tuổi Trẻ, CAND, VietnamNet, TTXVN, Báo Nhân Dân, Chinhphu.vn) trước khi tiến hành thu âm TTS và render video.
  * Tuyệt đối KHÔNG đưa tin sai sự thật, không phát tán tin đồn chưa kiểm chứng, không bịa đặt, không xuyên tạc.
  * Tự động hiệu đính kịch bản (Auto-Correction): Nếu phát hiện kịch bản nói quá (như thời tiết "trời rét" bị nâng thành "rét đậm cực mạnh") hoặc thiếu sót mốc thời gian (như mốc 1/7/2027), hệ thống tự động sửa lại kịch bản chuẩn 100% sự thật.
  * Nếu phát hiện nội dung có dấu hiệu tin giả, tin bịa đặt: Lập tức dừng pipeline và cảnh báo ngay cho người dùng trên Telegram, từ chối tạo video sai sự thật.
→ 3-second hook rule: Trong 3 giây đầu tiên (Hook mở đầu), BẮT BUỘC mở đầu bằng cụm từ cuốn hút, tự nhiên như 'Tin nóng!', 'Tin nóng nhất hôm nay!', 'Tin cực nóng!', 'Biến động mới nhất!'... TUYỆT ĐỐI KHÔNG lạm dụng từ 'khẩn cấp' (chỉ tin nóng là đủ lôi cuốn, không làm người xem thấy báo động giả hay mệt mỏi), tối ưu retention giữ chân người xem cao nhất.
→ Mobile-First High-Retention Layout rule:
  * TÁCH TIÊU ĐỀ RA KHỎI BANNER: Tuyệt đối không nhét cả tiêu đề dài vào banner dưới làm chữ bị nhỏ li ti không đọc nổi trên điện thoại.
  * Tiêu đề và text CĂN GIỮA TRỰC TIẾP TRÊN ẢNH: Toàn bộ cụm tiêu đề chính (cỡ 76-84px vàng viền đen dày, 1 dòng duy nhất) và tóm tắt được căn giữa theo cả chiều dọc và ngang trên diện tích ảnh, tạo trọng tâm thị giác hoàn hảo trên điện thoại.
  * Banner dưới hạ thấp còn 1/6 đáy màn hình (~320px): Dành trọn 83.3% diện tích phía trên cho ảnh/video thị giác to lớn. Nền banner giữ nguyên banner.png gốc của kênh nhưng được hạ xuống đáy tinh tế, chỉ hiển thị logo/tên kênh/ngày nhỏ ở đáy. Không nhét chữ dài quá 5-7 từ vào banner.
  * Pacing đổi ảnh nhanh (2.5s - 3s / ảnh): Tuyệt đối KHÔNG giữ 1 ảnh đứng im 7-9 giây khiến người xem chán lướt qua. Trung bình cứ 2.5s - 3s phải đổi ảnh mới hoặc đổi góc zoom Ken Burns nhẹ vào khuôn mặt/chi tiết quan trọng.
  * Dynamic Subtitles: Luôn có phụ đề TTS chạy chữ theo lời nói ở giữa màn hình (ngay trên mép banner) để người xem tắt tiếng vẫn nắm bắt toàn bộ câu chuyện.
→ Subtitles Proofreader rule: Bắt buộc luôn chạy bước rà soát chính tả chữ chạy tự động (Subtitles Proofreader) sau khi STT xong để đối chiếu timeline.json với kịch bản gốc script.json, sửa sạch toàn bộ lỗi phiên âm, lỗi nghe nhầm hay sai chính tả ngớ ngẩn (như "cô lộc bộ" ➔ "câu lạc bộ", "giàn" ➔ "dàn", sai tên riêng/giải đấu) trước khi đưa vào render video.
→ 3-in-1 Multimodal Synchronization Rule (Nói đến đâu - Đúng ảnh đó - Đúng tiêu đề đó):
  * BẮT BUỘC ĐỒNG BỘ 100% giữa Lời bình (voiceover/text) - Hình ảnh hiển thị (media) - Tiêu đề cảnh (title & subtitle).
  * Lời bình nói đến đâu thì hình ảnh và tiêu đề trên màn hình phải minh họa và tóm tắt chính xác nội dung đó:
    - Nếu cảnh nói về số liệu, biến động, thuế suất, giá cả, nhiệt độ định lượng -> BẮT BUỘC hiển thị ảnh Biểu đồ / Sơ đồ / Bảng số liệu, tiêu đề phải phản ánh rõ con số/biến động đó.
    - Nếu cảnh nói về hiện trường, điều tra, bắt bớ, tòa án, cứu hộ -> BẮT BUỘC hiển thị đúng ảnh hiện trường, công an, bị cáo, bệnh viện tương ứng.
  * Tuyệt đối KHÔNG ĐỂ XẢY RA: Ảnh hiển thị 1 kiểu, nội dung nói 1 kiểu khác, và tiêu đề lại 1 kiểu khác. Cả 3 yếu tố phải tạo thành một khối thống nhất hoàn chỉnh.
  * Phân bổ tư liệu: Sử dụng `syncMediaToScenes` để ghép nối tư liệu thông minh vào 4 cảnh dựa trên chú thích ảnh và từ khóa ngữ nghĩa, đảm bảo mỗi cảnh có ít nhất 1 tư liệu và 100% tư liệu đã thu thập đều được sử dụng.
→ Vietnamese Honorifics & Person Addressing Rule (Quy tắc danh xưng chuẩn mực cho nhân vật):
  * TUYỆT ĐỐI KHÔNG gọi tên người cộc lốc, trống không trong kịch bản (không nói "Lan nói", "Tuấn khai", "Hằng bị bắt", "Vân chỉ đạo").
  * BẮT BUỘC luôn gắn danh xưng chuẩn mực theo đúng vị thế xã hội, tư cách pháp lý và văn hóa tiếng Việt:
    - Lãnh đạo, cán bộ, chuyên gia: "ông [Tên]", "bà [Tên]", "Thủ tướng [Tên]", "Bộ trưởng [Tên]", "Luật sư [Tên]", "Bác sĩ [Tên]"...
    - Người dân, nhân chứng, nạn nhân: "ông", "bà", "anh", "chị", "em", "cháu", "người dân", "nạn nhân"...
    - Đối tượng phạm tội, bị can, bị cáo: "đối tượng [Tên]", "bị can [Tên]", "bị cáo [Tên]" (ví dụ: "đối tượng Tuấn", "bị can Nguyễn Văn A", "bị cáo Trương Mỹ Lan").
  * Giọng điệu văn phong phải đĩnh đạc, lịch thiệp, giữ chuẩn mực truyền hình thời sự, tôn trọng người xem.
→ Well-Structured Narrative Arc Rule (Quy tắc mạch truyện có đầu có cuối):
  * Kịch bản 4 cảnh phải tạo thành một câu chuyện liền mạch, có mở đầu, diễn biến, cao trào và kết thúc trọn vẹn:
    - CẢNH 1 (MỞ ĐẦU / ĐẦU CÂU CHUYỆN): Hook mở đầu giật gân, nêu rõ ngay bối cảnh sự việc, địa điểm, ai là nhân vật chính. Khán giả nắm bắt ngay lập tức bối cảnh câu chuyện.
    - CẢNH 2 & 3 (DIỄN BIẾN & CAO TRÀO): Dùng từ nối chuyển tiếp tự nhiên ("Theo đó...", "Đáng chú ý...", "Cụ thể...", "Tại cơ quan công an...", "Trước tình hình này..."), liên kết chặt chẽ các diễn biến, lời khai, chứng cứ và số liệu.
    - CẢNH 4 (KẾT BÀI / CÓ CUỐI TRỌN VẸN): BẮT BUỘC có phần đúc kết sự việc (kết quả xử lý, bài học cảnh giác cho người dân, lời khuyên chuyên gia hoặc hậu quả pháp lý) ĐẢM BẢO CÂU CHUYỆN KẾT THÚC CÓ HẬU / RÕ RÀNG trước khi đưa ra câu kêu gọi theo dõi kênh: "Hãy bấm theo dõi Hóng Hớt hai tư trên bảy để cập nhật tin mới nhất nhé!". Tuyệt đối không kết thúc cụt lủn, lửng lơ.
→ Evergreen & Emotional/Humorous Filler rule: Khi thời điểm đói tin nóng hoặc người dùng yêu cầu tìm tin, luôn chủ động chuẩn bị và đề xuất thêm các chủ đề cảm động (nghĩa cử ấm lòng, tình người trong mưa lũ/khó khăn, tấm gương nghị lực) hoặc hài hước (tình huống đời thường dở khóc dở cười, chuyện đám cưới/thú cưng/văn phòng viral) để kênh luôn có nội dung giữ chân khán giả và duy trì lịch đăng đều đặn mỗi ngày.
→ Read `docs/SKILL-GEN-VIDEO.md` and execute the 8-step pipeline:
  Setup → Planner → Teller → Audio → Transcribe → Spec → Coder → Render

When the user types `/templates`:
→ Read `docs/SKILL-TEMPLATES.md`, then list every entry from
  `src/templates/registry.ts` in the required two-column table.

When the user types `/update-bg-music --template <template-id-or-name> --music <music-file-or-path>`:
→ Read `docs/SKILL-UPDATE-BG-MUSIC.md`, then run the update script exactly as
  documented.

When the user types `/update-template-voice --template <template-id-or-name> [--gemini <voice-name>] [--elevenlabs <voice-id>]`:
→ Read `docs/SKILL-UPDATE-TEMPLATE-VOICE.md`, then run the update script
  exactly as documented.

When the user types `/add-music --category <name> [--file <filename-or-path>]`:
→ Read `docs/SKILL-ADD-MUSIC.md`, then run the add script exactly as
documented.

When the user types `/sync-templates [--package <package-folder>]`:
→ Read `docs/SKILL-SYNC-TEMPLATES.md`, then run the sync script exactly as
documented. Do not run `/gen-video` automatically after syncing.

When the user types `/update-logo [--file <filename-or-path>]`:
→ Read `docs/SKILL-UPDATE-LOGO.md`, then run the update script exactly as
documented.

When the user types `/update-config --key <ENV_KEY> --value <value>`:
→ Read `docs/SKILL-UPDATE-CONFIG.md`, then run the update script exactly as
  documented. Do not print secret values back to the user.

When the user types `/update-version`:
→ Read `docs/SKILL-UPDATE-VERSION.md`, then check
  `update-version/update-version.md`. If it is already marked updated, stop.
  Otherwise apply its instructions and mark it updated only after completion.

When the user types `/ai-help`:
→ Read `docs/SKILL-AI-HELP.md`, then list every supported command. Do not run
  any workflow or mutation command.

Follow the progressive-loading instructions in `docs/SKILL-GEN-VIDEO.md`. For
the Coder step, read `docs/remotion-best-practices/SKILL.md`, then only the
individual rule files required by the selected design.

The canonical docs in `docs/` are the single source of truth.

---

## Pipeline Overview

```
/gen-video [--audio=<mode>] <context>
  Step 1: Setup        → videos/<slug>/context.txt, audio.txt, directories
  Step 2: Planner      → videos/<slug>/plan.json
  Step 3: Teller       → videos/<slug>/script/script.json
  Step 4: Audio (TTS)  → public/<slug>/voice.mp3
                         (ElevenLabs primary, Gemini fallback)
  Step 5: Transcribe   → public/<slug>/timeline.json
                         (Groq primary, api.stt.ai fallback — segments + words)
  Step 6: Spec         → videos/<slug>/spec.json
                         (scene timing derived from timeline.json)
  Step 7: Coder        → selected template components and/or src/scenes/Scene*.tsx
                         src/VideoContent.tsx (with <Audio> + <Subtitles> overlay)
                         src/Root.tsx (defaultSlug, defaultDuration)
  Step 8: Render       → videos/<slug>/output/video.mp4
```

---

## Project Structure

```
create-video-with-ai/
├── docs/                    ← canonical skill documents (read this first)
│   ├── SKILL-AI-HELP.md
│   ├── SKILL-ADD-MUSIC.md
│   ├── SKILL-SETUP.md
│   ├── SKILL-GEN-VIDEO.md
│   ├── SKILL-SYNC-TEMPLATES.md
│   ├── SKILL-TEMPLATES.md
│   ├── SKILL-UPDATE-BG-MUSIC.md
│   ├── SKILL-UPDATE-TEMPLATE-VOICE.md
│   ├── SKILL-UPDATE-CONFIG.md
│   ├── SKILL-UPDATE-LOGO.md
│   ├── SKILL-UPDATE-VERSION.md
│   ├── gen-video/           ← lazy-loaded common, creative, verification rules
│   ├── remotion-best-practices/
│   └── templates/           ← per-template generation rules
├── scripts/
│   ├── add-music.mjs        ← add mp3 assets to public/assets/<category>/
│   ├── sync-templates.mjs   ← sync purchased template packages from load-templates/
│   ├── update-bg-music.mjs  ← set template defaultBgMusic in registry
│   ├── update-template-voice.mjs ← set template voice config in registry
│   ├── update-config.mjs    ← update .env keys without printing secrets
│   ├── update-logo.mjs      ← replace public/watermark.png
│   ├── update-version.mjs   ← guard/mark update-version instructions
│   ├── tts.mjs              ← TTS synthesis (ElevenLabs / Gemini)
│   ├── transcribe.mjs       ← STT transcription (Groq / api.stt.ai)
│   └── ...                  ← template acquisition/helper scripts
├── src/                     ← Remotion source (overwritten each /gen-video run)
│   ├── Root.tsx
│   ├── Video.tsx
│   ├── VideoContent.tsx     ← includes <Audio> component
│   ├── templates/           ← registered fixed/hybrid/creative templates
│   ├── tokens.ts            ← shared interface (do NOT modify)
│   └── scenes/              ← generated per-video (deleted + recreated each run)
│       ├── tokens.ts
│       ├── Scene1Hook.tsx
│       └── ...
├── public/
│   ├── watermark.png        ← shared watermark/logo replaced by /update-logo
│   ├── assets/              ← reusable template assets and music manifests
│   │   ├── creative/
│   │   └── news/
│   └── <slug>/              ← generated audio/timeline per video
│       ├── voice.mp3
│       └── timeline.json
├── videos/                  ← output artifacts per video
│   └── <slug>/
│       ├── context.txt
│       ├── audio.txt
│       ├── template.txt
│       ├── plan.json
│       ├── script/script.json
│       ├── spec.json
│       └── output/video.mp4
├── tmp-music/               ← local ignored staging for /add-music mp3 files
├── tmp-logo/                ← local ignored staging for /update-logo png files
├── load-templates/          ← local ignored staging for purchased template packages
├── update-version/          ← user-provided update-version.md instructions
├── .env                     ← local secrets/config updated by /update-config
└── .env.example             ← documented environment variable template
```
