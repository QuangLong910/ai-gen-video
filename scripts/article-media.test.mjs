import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractArticleBodyHtml,
  extractImagesFromHtml,
  extractVideosFromHtml,
  interleaveMedia,
  distributeMediaToScenes,
  parseBestFromSrcset,
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
