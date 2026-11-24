import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  extractArticleBodyHtml,
  extractImagesFromHtml,
  extractVideosFromHtml,
  interleaveMedia,
  distributeMediaToScenes,
  parseBestFromSrcset,
  upgradeToMasterImageUrl,
  cropAllImagesWithPython,
} from './article-media.mjs';

test('VnExpress: lấy đủ nhiều ảnh từ <picture>/<source data-srcset>, giữ nguyên query string ký số (?s=...) và không bị cắt bởi thẻ <article> phụ', () => {
  const html = `
    <html>
      <head>
        <meta property="og:image" content="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-1-1200x630.jpg?w=1200&amp;h=630&amp;s=META1" />
      </head>
      <body>
        <header><article class="mini-card"><p>Tin nổi bật</p><img src="https://i1-vnexpress.vnecdn.net/mini.jpg" /></article></header>
        <article class="fck_detail">
          <p>Đoạn mở đầu dài hơn 25 ký tự để mô tả đầy đủ sự kiện nóng trong ngày hôm nay.</p>
          <figure>
            <picture>
              <source data-srcset="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-1.jpg?w=680&amp;q=100&amp;s=SIG1 1x, https://i1-vnexpress.vnecdn.net/2026/11/21/anh-1.jpg?w=1020&amp;q=100&amp;s=SIG1HD 2x" />
              <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Ảnh 1" />
            </picture>
          </figure>
          <p>Đoạn thứ hai mô tả diễn biến chi tiết kèm theo nhiều hình ảnh hiện trường sắc nét.</p>
          <figure>
            <picture>
              <source data-srcset="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-2.jpg?w=1020&amp;q=100&amp;s=SIG2 1x" />
              <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Ảnh 2" />
            </picture>
          </figure>
          <figure>
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-3.jpg?w=1020&amp;q=100&amp;s=SIG3" />
          </figure>
          <figure>
            <img data-original="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-4.jpg?w=1020&amp;q=100&amp;s=SIG4" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
          </figure>
          <figure>
            <img data-src="https://i1-vnexpress.vnecdn.net/2026/11/21/anh-5.jpg?w=1020&amp;q=100&amp;s=SIG5" />
          </figure>
          <div class="box-tin-lien-quan">
            <img src="https://i1-vnexpress.vnecdn.net/2026/11/21/tin-lien-quan-rac.jpg" />
          </div>
        </article>
      </body>
    </html>
  `;

  const body = extractArticleBodyHtml(html);
  const imgs = extractImagesFromHtml(body, html, 'https://vnexpress.net/bai-bao-test.html');

  assert.equal(imgs.length, 5, `Phải lấy đủ 5 ảnh thân bài, thực tế: ${imgs.length}`);
  assert.ok(imgs[0].includes('w=1020&q=100&s=SIG1HD'), 'Phải ưu tiên bản 2x và giữ nguyên query string đã decode &');
  assert.ok(imgs[1].includes('s=SIG2'));
  assert.ok(imgs[2].includes('s=SIG3'));
  assert.ok(imgs[3].includes('s=SIG4'));
  assert.ok(imgs[4].includes('s=SIG5'));
  assert.ok(!imgs.some((u) => u.includes('tin-lien-quan-rac')), 'Không được lẫn ảnh tin liên quan');
});

test('Tuổi Trẻ / Dân Trí / Kênh 14: lấy ĐẦY ĐỦ > 6 ảnh và TẤT CẢ video nhúng (mp4, m3u8, data-vid không có https, JSON-LD VideoObject)', () => {
  const imgTags = Array.from({ length: 10 }, (_, i) => (
    `<figure><img data-original="https://cdn.tuoitre.vn/2026/11/21/photo-${i + 1}.jpg" src="/placeholder.png" /></figure>`
  )).join('\n');

  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "video": {
              "@type": "VideoObject",
              "contentUrl": "https://tuoitre.mediacdn.vn/2026/11/21/clip-jsonld.mp4"
            }
          }
        </script>
      </head>
      <body>
        <div class="detail-content">
          <p>Nội dung bài báo có rất nhiều ảnh hiện trường và các đoạn video tư liệu quan trọng.</p>
          <div class="VCSortableInPreviewMode" type="VideoStream" data-vid="tuoitre.mediacdn.vn/2026/11/21/clip-hien-truong-1.mp4"></div>
          <video poster="https://cdn.tuoitre.vn/2026/11/21/video-poster.jpg">
            <source src="https://tuoitre.mediacdn.vn/2026/11/21/clip-hien-truong-2.m3u8" type="application/x-mpegURL" />
          </video>
          ${imgTags}
        </div>
      </body>
    </html>
  `;

  const body = extractArticleBodyHtml(html);
  const imgs = extractImagesFromHtml(body, html, 'https://tuoitre.vn/bai-test.htm');
  const vids = extractVideosFromHtml(body, html, 'https://tuoitre.vn/bai-test.htm');

  assert.ok(imgs.length >= 10, `Phải lấy đủ toàn bộ 10 ảnh (không bị cắt ở 4 hay 6), thực tế: ${imgs.length}`);
  assert.equal(vids.length, 3, `Phải lấy đủ cả 3 video (data-vid, <source>, JSON-LD), thực tế: ${vids.length}`);
  assert.ok(vids.includes('https://tuoitre.mediacdn.vn/2026/11/21/clip-hien-truong-1.mp4'));
  assert.ok(vids.includes('https://tuoitre.mediacdn.vn/2026/11/21/clip-hien-truong-2.m3u8'));
  assert.ok(vids.includes('https://tuoitre.mediacdn.vn/2026/11/21/clip-jsonld.mp4'));
});

test('parseBestFromSrcset chọn đúng ảnh phân giải cao nhất', () => {
  const best = parseBestFromSrcset(
    'https://cdn.example.com/a-480.jpg 480w, https://cdn.example.com/a-1200.jpg?q=95 1200w, https://cdn.example.com/a-800.jpg 800w'
  );
  assert.equal(best, 'https://cdn.example.com/a-1200.jpg?q=95');
});

test('interleaveMedia + distributeMediaToScenes giữ 100% ảnh và video, phân bổ đều 4 cảnh', () => {
  const images = Array.from({ length: 10 }, (_, i) => ({ type: 'image', src: `crop_${i}.jpg` }));
  const videos = [
    { type: 'video', src: 'video_0.mp4', durationSec: 8 },
    { type: 'video', src: 'video_1.mp4', durationSec: 6 },
  ];

  const combined = interleaveMedia(images, videos);
  assert.equal(combined.length, 12);

  const scenes = distributeMediaToScenes(combined, 4);
  assert.equal(scenes.length, 4);
  assert.deepEqual(scenes.map((s) => s.length), [3, 3, 3, 3]);

  const flattened = scenes.flat().map((x) => x.src);
  for (let i = 0; i < 10; i++) {
    assert.ok(flattened.includes(`crop_${i}.jpg`), `Thiếu ảnh crop_${i}.jpg`);
  }
  assert.ok(flattened.includes('video_0.mp4'), 'Thiếu video_0.mp4');
  assert.ok(flattened.includes('video_1.mp4'), 'Thiếu video_1.mp4');
});

test('upgradeToMasterImageUrl: loại bỏ tiền tố thumb_w, zoom và khôi phục ảnh gốc master', () => {
  // Dân Trí / Tuổi Trẻ / Mediacdn
  assert.equal(
    upgradeToMasterImageUrl('https://icdn.dantri.com.vn/thumb_w/680/2026/11/24/bieu-do-123.jpg'),
    'https://icdn.dantri.com.vn/2026/11/24/bieu-do-123.jpg'
  );
  assert.equal(
    upgradeToMasterImageUrl('https://cdn.tuoitre.vn/thumb_w/730/471584752817336320/2026/11/24/photo-1.jpg'),
    'https://cdn.tuoitre.vn/471584752817336320/2026/11/24/photo-1.jpg'
  );
  assert.equal(
    upgradeToMasterImageUrl('https://cafefcdn.com/zoom/600_315/2026/11/24/chart.png'),
    'https://cafefcdn.com/2026/11/24/chart.png'
  );

  // VietnamNet / Thanh Niên (bỏ resize query params)
  assert.equal(
    upgradeToMasterImageUrl('https://static-images.vnncdn.net/files/publish/2026/11/24/abc.jpg?width=600'),
    'https://static-images.vnncdn.net/files/publish/2026/11/24/abc.jpg'
  );

  // WordPress / CMS thumbnail suffixes
  assert.equal(
    upgradeToMasterImageUrl('https://example.com/uploads/bieu-do-thong-ke-768x432.png'),
    'https://example.com/uploads/bieu-do-thong-ke.png'
  );
  assert.equal(
    upgradeToMasterImageUrl('https://example.com/uploads/photo-300x200.jpg'),
    'https://example.com/uploads/photo.jpg'
  );
});

test('cropAllImagesWithPython: biểu đồ dùng make_smart_fit giữ trọn 100% chi tiết không bị cắt xén', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-test-'));
  const pyBin = process.platform === 'win32' ? 'python' : 'python3';

  // 1. Tạo 1 ảnh biểu đồ 16:9 nền trắng (1280x720) có chữ/thanh cột ở rìa mép
  const chartPath = path.join(tmpDir, 'raw_bieu_do_test.jpg');
  // 2. Tạo 1 ảnh tin tức vuông 1:1 (900x900)
  const photoPath = path.join(tmpDir, 'raw_photo_normal.jpg');

  execFileSync(pyBin, [
    '-c',
    `
from PIL import Image
# Chart 16:9 với các điểm mốc ở sát rìa trái (x=20) và rìa phải (x=1260)
c = Image.new('RGB', (1280, 720), (255, 255, 255))
for y in range(100, 600):
    c.putpixel((20, y), (0, 0, 0)) # cột mốc sát lề trái
    c.putpixel((1260, y), (0, 0, 0)) # cột mốc sát lề phải
c.save(r'${chartPath}', quality=95)

p = Image.new('RGB', (900, 900), (80, 120, 160))
p.save(r'${photoPath}', quality=95)
`,
  ]);

  const results = cropAllImagesWithPython(pyBin, [chartPath, photoPath], tmpDir, 4);
  assert.equal(results.length, 4, 'Phải tạo đủ 4 crop images');

  // Kiểm tra ảnh đầu ra crop_0.jpg (từ chartPath) và crop_1.jpg (từ photoPath)
  for (const f of results) {
    const fPath = path.join(tmpDir, f);
    assert.ok(fs.existsSync(fPath), `File ${f} phải tồn tại`);
    const sizeOut = execFileSync(
      pyBin,
      ['-c', `from PIL import Image; im = Image.open(r'${fPath}'); print(f'{im.width}x{im.height}')`],
      { encoding: 'utf-8' }
    ).trim();
    assert.equal(sizeOut, '1080x1040', `Kích thước của ${f} phải chuẩn 1080x1040`);
  }

  // Dọn dẹp tmp
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
