/**
 * scripts/article-media.mjs
 *
 * Trích xuất & tải đầy đủ TẤT CẢ tư liệu ảnh và video từ link bài báo
 * (hỗ trợ chuẩn báo chí Việt Nam: VnExpress, Dân Trí, Tuổi Trẻ, Thanh Niên,
 * Tiền Phong, Vietnamnet, Kênh 14, Lao Động, Soha, Znews... và báo quốc tế).
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// ─── HTML & URL Helpers ──────────────────────────────────────────────────────

export function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\\\//g, '/');
}

export function normalizeMediaUrl(rawUrl, baseUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let cleaned = decodeHtmlEntities(rawUrl).trim().replace(/^['"]|['"]$/g, '').trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('about:') ||
    lower.startsWith('#')
  ) {
    return null;
  }

  // VCCorp / Tuổi Trẻ / Kênh 14 đôi khi để data-vid="tuoitre.mediacdn.vn/..." không có protocol
  if (!/^https?:\/\//i.test(cleaned) && !cleaned.startsWith('//') && !cleaned.startsWith('/')) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }
  }

  try {
    if (cleaned.startsWith('//')) {
      const proto = baseUrl && baseUrl.startsWith('http:') ? 'http:' : 'https:';
      return new URL(`${proto}${cleaned}`).href;
    }
    if (baseUrl) {
      return new URL(cleaned, baseUrl).href;
    }
    return new URL(cleaned).href;
  } catch {
    return null;
  }
}

const BAD_IMAGE_URL_PATTERNS = [
  /logo/i,
  /favicon/i,
  /icon[-_./]/i,
  /[-_./]icon/i,
  /avatar/i,
  /banner/i,
  /adbox/i,
  /box-game/i,
  /minigame/i,
  /quangcao/i,
  /sponsor/i,
  /35x35/i,
  /40x22/i,
  /1x1\./i,
  /pixel\.(?:gif|png)/i,
  /spacer\.(?:gif|png)/i,
  /blank\.(?:gif|png|jpg)/i,
  /transparent/i,
  /placeholder/i,
  /loading\.(?:gif|png|svg)/i,
  /default[-_.]?(?:thumb|avatar|img|image)/i,
  /share[-_.]?(?:fb|facebook|twitter|zalo)/i,
  /\.svg(?:\?|$)/i,
  /\.gif(?:\?|$)/i,
  /\.ico(?:\?|$)/i,
  /doubleclick\.net/i,
  /googlesyndication/i,
  /facebook\.com\/tr/i,
];

const BAD_VIDEO_URL_PATTERNS = [
  /doubleclick\.net/i,
  /googlesyndication/i,
  /imasdk\.googleapis/i,
  /\/ads?\//i,
  /preroll/i,
  /midroll/i,
  /quangcao/i,
  /banner/i,
  /intro[-_]?logo/i,
];

const BAD_CLASS_OR_ID_REGEX =
  /(?:^|[\s_-])(?:logo|icon|button|avatar|banner|adbox|box-game|minigame|game-box|quangcao|sidebar|tin_lien_quan|tin-lien-quan|related|sponsor|share-btn|social-icon)(?:$|[\s_-])/i;

export function isBadImageUrl(url) {
  if (!url) return true;
  return BAD_IMAGE_URL_PATTERNS.some((rx) => rx.test(url));
}

export function isBadVideoUrl(url) {
  if (!url) return true;
  return BAD_VIDEO_URL_PATTERNS.some((rx) => rx.test(url));
}

/**
 * So sánh 2 URL ảnh có cùng một gốc ảnh hay không (bỏ qua query string & hậu tố crop/thumb)
 * LƯU Ý: Chỉ dùng để chống trùng lặp, KHÔNG bao giờ cắt query string khi lưu/tải URL!
 */
export function isSameImage(url1, url2) {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;

  const cleanPath = (u) => {
    try {
      const parsed = new URL(u);
      return parsed.pathname.toLowerCase();
    } catch {
      return u.split('?')[0].toLowerCase();
    }
  };

  const p1 = cleanPath(url1);
  const p2 = cleanPath(url2);
  if (p1 === p2) return true;

  const f1 = p1.split('/').pop() || '';
  const f2 = p2.split('/').pop() || '';
  if (f1 && f1 === f2) return true;

  const stem = (f) =>
    f
      .replace(/\.(?:jpg|jpeg|png|webp|avif)$/i, '')
      .replace(/-crop-.*$/, '')
      .replace(/[-_]\d+x\d+$/, '')
      .replace(/-\d{10,}$/, '')
      .slice(0, 32);

  const stem1 = stem(f1);
  const stem2 = stem(f2);
  if (stem1.length >= 4 && stem1 === stem2) {
    return true;
  }
  if (stem1.length >= 12 && stem2.length >= 12 && (stem1.includes(stem2) || stem2.includes(stem1))) {
    return true;
  }
  return false;
}

export function isSameVideo(url1, url2) {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const stem = (u) => {
    try {
      const p = new URL(u).pathname.toLowerCase();
      return p
        .replace(/\/(?:master|playlist|index|manifest)\.m3u8$/i, '')
        .replace(/\.(?:mp4|m3u8|webm|mov)$/i, '');
    } catch {
      return u.split('?')[0].toLowerCase();
    }
  };
  const s1 = stem(url1);
  const s2 = stem(url2);
  return Boolean(s1 && s2 && (s1 === s2 || s1.endsWith(s2) || s2.endsWith(s1)));
}

// ─── Balanced HTML Tag Utilities ─────────────────────────────────────────────

/**
 * Từ vị trí bắt đầu của một thẻ mở (ví dụ <div ...> hoặc <article ...>),
 * tìm đúng thẻ đóng tương ứng theo chiều sâu để không bị cắt cụt bởi thẻ lồng nhau.
 */
export function extractBalancedBlock(html, startIdx) {
  const openMatch = html.slice(startIdx).match(/^<([a-z0-9]+)\b[^>]*>/i);
  if (!openMatch) return '';
  const tagName = openMatch[1].toLowerCase();
  const tagRegex = new RegExp(`<(\\/?)${tagName}\\b[^>]*>`, 'gi');
  tagRegex.lastIndex = startIdx;

  let depth = 0;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClosing = /\/>$/.test(m[0]);
    if (isClose) {
      depth--;
      if (depth <= 0) {
        return html.slice(startIdx, tagRegex.lastIndex);
      }
    } else if (!isSelfClosing) {
      depth++;
    }
  }
  // Fallback nếu HTML bị thiếu thẻ đóng
  return html.slice(startIdx, Math.min(html.length, startIdx + 120000));
}

/**
 * Loại bỏ an toàn các khối rác (tin liên quan, bình luận, quảng cáo, sidebar) theo đúng thẻ đóng mở.
 */
export function stripNoiseBlocks(html) {
  let out = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    // Giữ lại nội dung bên trong <noscript> vì nhiều báo đặt <img> thật trong <noscript>
    .replace(/<\/?noscript[^>]*>/gi, '');

  const noiseClassRegex =
    /<(div|section|aside|ul)\b[^>]*(?:class|id|type)=["'][^"']*(?:boxG_|minigame|game-box|box-game|poll-box|tin_lien_quan|tin-lien-quan|box-tin-lien-quan|related-news|box-related|box-comment|comment-box|comments-area|box-share|adbox|quangcao|sidebar-2|right-sidebar|menu-box)[^"']*["'][^>]*>/gi;

  // Lặp tối đa 40 lần để tránh vòng lặp vô hạn
  for (let iter = 0; iter < 40; iter++) {
    noiseClassRegex.lastIndex = 0;
    const match = noiseClassRegex.exec(out);
    if (!match) break;
    const block = extractBalancedBlock(out, match.index);
    if (!block) break;
    out = out.slice(0, match.index) + out.slice(match.index + block.length);
  }

  return out;
}

// ─── Article Body Extraction ─────────────────────────────────────────────────

const ARTICLE_BODY_SELECTORS = [
  'fck_detail', // VnExpress
  'singular-content', // Dân Trí
  'detail-content', // Tuổi Trẻ, Thanh Niên, Tiền Phong
  'detail__content',
  'detail-cmain',
  'detail-content-body',
  'maincontent', // Vietnamnet
  'main-detail',
  'content-detail',
  'content_detail',
  'knc-content', // Kênh 14
  'detail-body',
  'article-body',
  'article__body',
  'article__content',
  'article-content',
  'the-article-body', // Znews
  'cms-body',
  'body-content',
  'entry-content',
  'post-content',
  'news-content',
  'art-body',
  'singular-container', // Dân Trí full wrapper (bao gồm cả ảnh bìa + gallery)
  'detail-wrap',
];

function scoreCandidateHtml(chunk) {
  if (!chunk) return 0;
  const pCount = (chunk.match(/<p\b/gi) || []).length;
  const mediaCount = (chunk.match(/<(?:img|picture|figure|video)\b/gi) || []).length;
  const textLen = chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  return pCount * 50 + mediaCount * 120 + Math.min(textLen, 15000) * 0.2;
}

/**
 * Tìm chính xác vùng nội dung bài báo (chọn khối giàu nội dung + ảnh/video nhất thay vì thẻ <article> đầu tiên bị cụt).
 */
export function extractArticleBodyHtml(html) {
  const candidates = [];

  // 1. Quét tất cả thẻ <article> bằng balanced scanner
  const articleOpenRegex = /<article\b[^>]*>/gi;
  let am;
  while ((am = articleOpenRegex.exec(html)) !== null) {
    const block = extractBalancedBlock(html, am.index);
    if (block.length > 200) {
      candidates.push(block);
    }
  }

  // 2. Quét các selector bài báo phổ biến
  for (const sel of ARTICLE_BODY_SELECTORS) {
    const selRegex = new RegExp(`<(?:div|section|article|main)\\b[^>]*(?:class|id)=["'][^"']*\\b${sel}\\b[^"']*["'][^>]*>`, 'gi');
    let sm;
    while ((sm = selRegex.exec(html)) !== null) {
      const block = extractBalancedBlock(html, sm.index);
      if (block.length > 200) {
        candidates.push(block);
      }
    }
  }

  if (candidates.length === 0) {
    return stripNoiseBlocks(html);
  }

  // Chọn khối có điểm nội dung + tư liệu cao nhất (tránh chọn nhầm thẻ <article> tin liên quan nhỏ)
  let best = '';
  let bestScore = -1;
  for (const cand of candidates) {
    const cleaned = stripNoiseBlocks(cand);
    const sc = scoreCandidateHtml(cleaned);
    if (sc > bestScore) {
      bestScore = sc;
      best = cleaned;
    }
  }

  return best || stripNoiseBlocks(html);
}

// ─── Srcset & Attribute Extraction ───────────────────────────────────────────

export function parseBestFromSrcset(srcset, baseUrl = '') {
  if (!srcset || typeof srcset !== 'string') return null;
  const decoded = decodeHtmlEntities(srcset);
  // Tách các entry theo dấu phẩy theo sau là khoảng trắng + URL mới (tránh cắt nhầm dấu phẩy trong URL CDN như Cloudinary/VnExpress)
  const parts = decoded.split(/,\s+(?=(?:https?:|\/\/|\/|[a-zA-Z0-9._-]+\/))/);
  let bestUrl = null;
  let bestWeight = -1;

  for (const part of parts) {
    const tokens = part.trim().split(/\s+/);
    if (!tokens[0]) continue;
    const url = normalizeMediaUrl(tokens[0], baseUrl);
    if (!url || isBadImageUrl(url)) continue;

    let weight = 1;
    if (tokens[1]) {
      const wMatch = tokens[1].match(/^(\d+)w$/i);
      const xMatch = tokens[1].match(/^([\d.]+)x$/i);
      if (wMatch) weight = parseInt(wMatch[1], 10);
      else if (xMatch) weight = parseFloat(xMatch[1]) * 1000;
    }
    if (weight >= bestWeight) {
      bestWeight = weight;
      bestUrl = url;
    }
  }

  return bestUrl;
}

function getAttr(attrs, name) {
  const rx = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = attrs.match(rx);
  return m ? (m[1] ?? m[2] ?? '') : '';
}

function addUniqueImage(list, rawUrl, baseUrl) {
  const url = normalizeMediaUrl(rawUrl, baseUrl);
  if (!url || isBadImageUrl(url)) return;
  if (list.some((existing) => isSameImage(existing, url))) return;
  list.push(url);
}

function scanImagesInChunk(chunk, baseUrl) {
  const found = [];

  // 1. Quét theo thứ tự xuất hiện của <picture>, <img>, và <a ... lightbox/ảnh gốc>
  // Quét từng <picture>...</picture> trước để lấy ảnh phân giải cao nhất từ <source data-srcset / srcset>
  const pictureRegex = /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi;
  let pm;
  while ((pm = pictureRegex.exec(chunk)) !== null) {
    const inner = pm[1];
    // Kiểm tra nếu thẻ img bên trong có class rác
    const innerImg = inner.match(/<img\b([^>]*)>/i);
    if (innerImg) {
      const clsId = `${getAttr(innerImg[1], 'class')} ${getAttr(innerImg[1], 'id')}`;
      if (BAD_CLASS_OR_ID_REGEX.test(clsId)) continue;
    }

    // Ưu tiên data-original / data-full-src trên img trước
    if (innerImg) {
      const orig =
        getAttr(innerImg[1], 'data-original') ||
        getAttr(innerImg[1], 'data-full-src') ||
        getAttr(innerImg[1], 'data-large-src') ||
        getAttr(innerImg[1], 'data-zoom-src');
      if (orig) {
        addUniqueImage(found, orig, baseUrl);
        continue;
      }
    }

    // Sau đó lấy URL tốt nhất từ <source data-srcset / srcset> (rất quan trọng cho VnExpress & Dân Trí!)
    const sourceRegex = /<source\b([^>]*)>/gi;
    let sm;
    let gotFromSource = false;
    while ((sm = sourceRegex.exec(inner)) !== null) {
      const sAttrs = sm[1];
      const best =
        parseBestFromSrcset(getAttr(sAttrs, 'data-srcset'), baseUrl) ||
        parseBestFromSrcset(getAttr(sAttrs, 'srcset'), baseUrl) ||
        normalizeMediaUrl(getAttr(sAttrs, 'data-src') || getAttr(sAttrs, 'src'), baseUrl);
      if (best && !isBadImageUrl(best)) {
        addUniqueImage(found, best, baseUrl);
        gotFromSource = true;
        break;
      }
    }
    if (gotFromSource) continue;

    // Fallback về <img> trong <picture>
    if (innerImg) {
      const iAttrs = innerImg[1];
      const cand =
        getAttr(iAttrs, 'data-lazy-src') ||
        getAttr(iAttrs, 'data-src') ||
        parseBestFromSrcset(getAttr(iAttrs, 'data-srcset'), baseUrl) ||
        parseBestFromSrcset(getAttr(iAttrs, 'srcset'), baseUrl) ||
        getAttr(iAttrs, 'src');
      if (cand) addUniqueImage(found, cand, baseUrl);
    }
  }

  // 2. Quét tất cả thẻ <img> trong chunk
  const imgTagRegex = /<img\b([^>]*)>/gi;
  let im;
  while ((im = imgTagRegex.exec(chunk)) !== null) {
    const attrs = im[1];
    const clsId = `${getAttr(attrs, 'class')} ${getAttr(attrs, 'id')}`;
    if (BAD_CLASS_OR_ID_REGEX.test(clsId)) continue;

    // Ưu tiên ảnh gốc độ phân giải cao nhất
    const candidates = [
      getAttr(attrs, 'data-original'),
      getAttr(attrs, 'data-full-src'),
      getAttr(attrs, 'data-large-src'),
      getAttr(attrs, 'data-zoom-src'),
      getAttr(attrs, 'data-high-res-src'),
      getAttr(attrs, 'data-lazy-src'),
      getAttr(attrs, 'data-src'),
      parseBestFromSrcset(getAttr(attrs, 'data-srcset'), baseUrl),
      parseBestFromSrcset(getAttr(attrs, 'srcset'), baseUrl),
      getAttr(attrs, 'src'),
    ];

    for (const c of candidates) {
      if (!c) continue;
      const normalized = normalizeMediaUrl(c, baseUrl);
      if (normalized && !isBadImageUrl(normalized)) {
        addUniqueImage(found, normalized, baseUrl);
        break;
      }
    }
  }

  // 3. Quét các link lightbox / gallery ảnh gốc (<a href="...jpg|png|webp">)
  const linkImgRegex = /<a\b([^>]*)>/gi;
  let lm;
  while ((lm = linkImgRegex.exec(chunk)) !== null) {
    const attrs = lm[1];
    const href = getAttr(attrs, 'href') || getAttr(attrs, 'data-src');
    if (href && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(decodeHtmlEntities(href))) {
      addUniqueImage(found, href, baseUrl);
    }
  }

  // 4. Poster từ thẻ <video poster="..."> (nếu cần bổ sung tư liệu ảnh)
  const videoPosterRegex = /<video\b([^>]*)>/gi;
  let vm;
  while ((vm = videoPosterRegex.exec(chunk)) !== null) {
    const poster = getAttr(vm[1], 'poster') || getAttr(vm[1], 'data-poster');
    if (poster) addUniqueImage(found, poster, baseUrl);
  }

  return found;
}

function extractJsonLdBlocks(fullHtml) {
  const results = [];
  const rx = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(fullHtml)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
      // Bỏ qua JSON-LD lỗi cú pháp
    }
  }
  return results;
}

/**
 * Trích xuất TẤT CẢ ảnh báo chí từ bài viết (KHÔNG giới hạn 1-4 ảnh).
 */
export function extractImagesFromHtml(contentHtml, fullHtml, baseUrl = '', maxImages = 24) {
  const images = scanImagesInChunk(contentHtml, baseUrl);

  // Nếu vùng thân bài chỉ trích xuất được <= 1 ảnh (ví dụ bài Photo Story, bài đa phương tiện có gallery nằm ngoài div text),
  // quét bổ sung tất cả <figure> và <picture> trong toàn trang (đã lọc bỏ header/footer/nav/sidebar/related).
  if (images.length <= 1 && fullHtml) {
    const cleanedFull = stripNoiseBlocks(fullHtml);
    const figureMatches = cleanedFull.match(/<(?:figure|picture)\b[^>]*>[\s\S]*?<\/(?:figure|picture)>/gi) || [];
    for (const fig of figureMatches) {
      const figImgs = scanImagesInChunk(fig, baseUrl);
      for (const u of figImgs) {
        addUniqueImage(images, u, baseUrl);
      }
    }
  }

  // Bổ sung ảnh từ JSON-LD (nhiều báo liệt kê mảng ảnh bài viết trong JSON-LD)
  if (fullHtml) {
    const jsonLds = extractJsonLdBlocks(fullHtml);
    const collectJsonImages = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(collectJsonImages);
        return;
      }
      if (node.image) {
        const imgs = Array.isArray(node.image) ? node.image : [node.image];
        for (const item of imgs) {
          if (typeof item === 'string') addUniqueImage(images, item, baseUrl);
          else if (item && typeof item === 'object' && item.url) addUniqueImage(images, item.url, baseUrl);
        }
      }
      if (node['@graph']) collectJsonImages(node['@graph']);
    };
    collectJsonImages(jsonLds);
  }

  // Bổ sung ảnh đại diện từ meta tags (og:image, twitter:image, link image_src) nếu chưa có trong thân bài
  if (fullHtml) {
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let mm;
    while ((mm = metaRegex.exec(fullHtml)) !== null) {
      const attrs = mm[1];
      if (/(?:property|name|itemprop)=["'](?:og:image|og:image:secure_url|twitter:image|image|thumbnailUrl)["']/i.test(attrs)) {
        const content = getAttr(attrs, 'content');
        if (content) addUniqueImage(images, content, baseUrl);
      }
    }
    const linkRegex = /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi;
    let lm;
    while ((lm = linkRegex.exec(fullHtml)) !== null) {
      addUniqueImage(images, lm[1], baseUrl);
    }
  }

  return images.slice(0, maxImages);
}

// ─── Video Extraction ────────────────────────────────────────────────────────

function addUniqueVideo(list, rawUrl, baseUrl) {
  const url = normalizeMediaUrl(rawUrl, baseUrl);
  if (!url || isBadVideoUrl(url)) return;
  if (!/\.(?:mp4|m3u8|webm|mov)(?:\?|$)/i.test(url)) return;

  const existingIdx = list.findIndex((existing) => isSameVideo(existing, url));
  if (existingIdx !== -1) {
    // Ưu tiên .mp4 hơn .m3u8 nếu cùng một video
    if (/\.mp4(?:\?|$)/i.test(url) && /\.m3u8(?:\?|$)/i.test(list[existingIdx])) {
      list[existingIdx] = url;
    }
    return;
  }
  list.push(url);
}

/**
 * Trích xuất TẤT CẢ video nhúng (.mp4, .m3u8, .webm) trong bài báo.
 */
export function extractVideosFromHtml(contentHtml, fullHtml, baseUrl = '', maxVideos = 8) {
  const videos = [];
  const scanTarget = contentHtml || fullHtml || '';

  // 1. Thẻ <video> và <source>
  const videoTagRegex = /<(?:video|source)\b([^>]*)>/gi;
  let vm;
  while ((vm = videoTagRegex.exec(scanTarget)) !== null) {
    const attrs = vm[1];
    const candidates = [
      getAttr(attrs, 'data-mp4'),
      getAttr(attrs, 'data-video'),
      getAttr(attrs, 'data-video-src'),
      getAttr(attrs, 'data-file'),
      getAttr(attrs, 'data-src'),
      getAttr(attrs, 'data-hls'),
      getAttr(attrs, 'src'),
    ];
    for (const c of candidates) {
      if (c) addUniqueVideo(videos, c, baseUrl);
    }
  }

  // 2. Các thẻ container video báo chí Việt Nam (VCCorp Tuổi Trẻ / Thanh Niên / Kênh 14 / Soha, Dân Trí, VnExpress, Vietnamnet)
  const attrVideoRegex =
    /\b(?:data-vid|data-video|data-video-src|data-mp4|data-file|data-hls|data-url-video|data-src-video)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let avm;
  while ((avm = attrVideoRegex.exec(scanTarget)) !== null) {
    const val = avm[1] ?? avm[2] ?? '';
    if (val) addUniqueVideo(videos, val, baseUrl);
  }

  // 3. Quét URL .mp4 / .m3u8 trực tiếp trong contentHtml (và trong các block script video của fullHtml)
  const directVideoUrlRegex = /https?:\\?\/\\?\/[^"'\s<>\\]+\.(?:mp4|m3u8|webm)(?:\?[^"'\s<>\\]*)?/gi;
  let dm;
  while ((dm = directVideoUrlRegex.exec(scanTarget)) !== null) {
    addUniqueVideo(videos, dm[0], baseUrl);
  }

  // 4. JSON-LD VideoObject
  if (fullHtml) {
    const jsonLds = extractJsonLdBlocks(fullHtml);
    const collectJsonVideos = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(collectJsonVideos);
        return;
      }
      const typeStr = Array.isArray(node['@type']) ? node['@type'].join(',') : String(node['@type'] || '');
      if (/VideoObject/i.test(typeStr)) {
        if (node.contentUrl) addUniqueVideo(videos, node.contentUrl, baseUrl);
        if (node.embedUrl && /\.(?:mp4|m3u8)(?:\?|$)/i.test(node.embedUrl)) {
          addUniqueVideo(videos, node.embedUrl, baseUrl);
        }
      }
      if (node.video) collectJsonVideos(node.video);
      if (node['@graph']) collectJsonVideos(node['@graph']);
    };
    collectJsonVideos(jsonLds);

    // 5. Meta tags og:video / twitter:player:stream
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let mm;
    while ((mm = metaRegex.exec(fullHtml)) !== null) {
      const attrs = mm[1];
      if (/(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']/i.test(attrs)) {
        const content = getAttr(attrs, 'content');
        if (content) addUniqueVideo(videos, content, baseUrl);
      }
    }

    // 6. Nếu trong contentHtml chưa tìm thấy video nhưng fullHtml có script cấu hình player chứa mp4/m3u8 từ CDN báo chí
    if (videos.length === 0) {
      const cdnVideoRegex =
        /https?:\\?\/\\?\/[^"'\s<>\\]*(?:vnecdn\.net|mediacdn\.vn|dantri\.com\.vn|vgcloud\.vn|vietnamnet\.vn|tuoitre\.vn|thanhnien\.vn|kenh14\.vn|laodong\.vn|vtv\.vn|vov\.vn)[^"'\s<>\\]*\.(?:mp4|m3u8)(?:\?[^"'\s<>\\]*)?/gi;
      let cm;
      while ((cm = cdnVideoRegex.exec(fullHtml)) !== null) {
        addUniqueVideo(videos, cm[0], baseUrl);
      }
    }
  }

  return videos.slice(0, maxVideos);
}

// ─── Cross-Platform Python & FFmpeg Helpers ──────────────────────────────────

let cachedPythonBin = null;

export function detectPythonBin() {
  if (cachedPythonBin) return cachedPythonBin;
  const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      cachedPythonBin = bin;
      return bin;
    } catch {
      // Thử binary tiếp theo
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function validateImageWithPython(pythonBin, rawPath) {
  const pyCode = [
    'import sys',
    'from PIL import Image',
    'im = Image.open(sys.argv[1])',
    'w, h = im.size',
    'if w < 300 or h < 200: sys.exit(1)',
    'ratio = w / h',
    'if ratio < 0.35 or ratio > 2.8: sys.exit(1)',
  ].join('\n');

  execFileSync(pythonBin, ['-c', pyCode, rawPath], { stdio: 'ignore' });
}

function cropAllImagesWithPython(pythonBin, rawPaths, outDir, minOutputs = 4) {
  const pyCode = `
import json, os, sys
from PIL import Image

raw_paths = json.loads(sys.argv[1])
out_dir = sys.argv[2]
min_outputs = int(sys.argv[3])

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

bases = []
saved = []

for idx, rp in enumerate(raw_paths):
    try:
        im = Image.open(rp)
        b = make_center_crop(im)
        fname = f'crop_{len(saved)}.jpg'
        b.save(os.path.join(out_dir, fname), quality=95)
        bases.append(b)
        saved.append(fname)
    except Exception:
        pass

# Chỉ tạo thêm biến thể zoom nhẹ nếu tổng tư liệu ảnh quá ít (< min_outputs)
if len(bases) > 0 and len(saved) < min_outputs:
    zoom_factors = [0.85, 0.78, 0.88]
    zi = 0
    while len(saved) < min_outputs:
        base = bases[zi % len(bases)]
        fname = f'crop_{len(saved)}.jpg'
        if zi == 2 and len(bases) == 1:
            make_upper_crop(base).save(os.path.join(out_dir, fname), quality=95)
        else:
            zf = zoom_factors[zi % len(zoom_factors)]
            make_zoom_crop(base, zf).save(os.path.join(out_dir, fname), quality=95)
        saved.append(fname)
        zi += 1

print(json.dumps(saved))
`;

  const stdout = execFileSync(pythonBin, ['-c', pyCode, JSON.stringify(rawPaths), outDir, String(minOutputs)], {
    encoding: 'utf-8',
  });
  return JSON.parse(stdout.trim());
}

function probeVideoDuration(videoPath) {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const dur = parseFloat(out.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : 5;
  } catch {
    return 5;
  }
}

async function downloadAndNormalizeVideo(videoUrl, outPath, refererUrl = '') {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const isHls = /\.m3u8(?:\?|$)/i.test(videoUrl);

  if (isHls) {
    // Tải trực tiếp stream HLS (.m3u8) bằng ffmpeg, chuẩn hóa H.264 30fps, tối đa 15 giây, bỏ âm thanh gốc
    const headersArg = refererUrl ? `Referer: ${refererUrl}\r\nUser-Agent: ${ua}\r\n` : `User-Agent: ${ua}\r\n`;
    execFileSync(
      'ffmpeg',
      [
        '-headers',
        headersArg,
        '-i',
        videoUrl,
        '-t',
        '15',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-vf',
        'scale=1080:-2',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-movflags',
        '+faststart',
        outPath,
        '-y',
      ],
      { stdio: 'ignore', timeout: 60000 }
    );
  } else {
    const tmpRaw = `${outPath}.raw.mp4`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);
      const headers = { 'User-Agent': ua };
      if (refererUrl) headers.Referer = refererUrl;

      const res = await fetch(videoUrl, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      // Bỏ qua file quá nhỏ (< 50KB) hoặc quá lớn (> 80MB)
      if (buf.byteLength < 50 * 1024 || buf.byteLength > 80 * 1024 * 1024) {
        throw new Error(`Kích thước video không hợp lệ (${buf.byteLength} bytes)`);
      }
      fs.writeFileSync(tmpRaw, buf);

      execFileSync(
        'ffmpeg',
        [
          '-i',
          tmpRaw,
          '-t',
          '15',
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-r',
          '30',
          '-vf',
          'scale=1080:-2',
          '-preset',
          'fast',
          '-crf',
          '23',
          '-movflags',
          '+faststart',
          outPath,
          '-y',
        ],
        { stdio: 'ignore', timeout: 60000 }
      );
    } finally {
      if (fs.existsSync(tmpRaw)) fs.unlinkSync(tmpRaw);
    }
  }

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 20 * 1024) {
    throw new Error('Video đầu ra không hợp lệ sau khi chuẩn hóa');
  }
  return probeVideoDuration(outPath);
}

// ─── Full Media Downloader (ALL Images + ALL Videos) ─────────────────────────

export async function downloadArticleMedia({
  imgUrls = [],
  videoUrls = [],
  outDir,
  articleUrl = '',
  fallbackQuery = '',
  searchNewsImagesFn = null,
  fallbackImageSource = '',
  maxImages = 20,
  maxVideos = 6,
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const pythonBin = detectPythonBin();
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const rawImagePaths = [];
  const savedVideos = [];

  // 1. Tải TẤT CẢ video tư liệu từ bài viết (nếu có)
  for (let i = 0; i < videoUrls.length && savedVideos.length < maxVideos; i++) {
    const vUrl = videoUrls[i];
    const vidFilename = `video_${savedVideos.length}.mp4`;
    const vidPath = path.join(outDir, vidFilename);
    try {
      console.log(`  [Video tư liệu ${savedVideos.length + 1}/${Math.min(videoUrls.length, maxVideos)}] Đang tải: ${vUrl.slice(0, 80)}...`);
      const durationSec = await downloadAndNormalizeVideo(vUrl, vidPath, articleUrl);
      savedVideos.push({ type: 'video', src: vidFilename, durationSec });
      console.log(`  ✅ [Video tư liệu ${savedVideos.length}] Thành công (${durationSec.toFixed(1)}s): ${vidFilename}`);
    } catch (err) {
      console.warn(`  ⚠️ Bỏ qua video lỗi (${vUrl.slice(0, 60)}):`, err.message);
      if (fs.existsSync(vidPath)) fs.unlinkSync(vidPath);
    }
  }

  // 2. Tải TẤT CẢ ảnh báo chí từ bài viết (KHÔNG giới hạn 4 ảnh nữa!)
  for (let i = 0; i < imgUrls.length && rawImagePaths.length < maxImages; i++) {
    const imgUrl = imgUrls[i];
    const rawPath = path.join(outDir, `raw_${rawImagePaths.length}.jpg`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const headers = {
        'User-Agent': ua,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      };
      if (articleUrl) headers.Referer = articleUrl;

      const res = await fetch(imgUrl, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength < 12 * 1024) continue; // Bỏ qua icon/ảnh < 12KB

      fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));

      try {
        validateImageWithPython(pythonBin, rawPath);
        rawImagePaths.push(rawPath);
        console.log(`  [Ảnh báo chí ${rawImagePaths.length}] Tải thành công: ${imgUrl.slice(0, 80)}...`);
      } catch {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      }
    } catch {
      if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    }
  }

  // 3. CHỈ KHI bài viết không có bất kỳ ảnh/video nào (0 ảnh & 0 video), mới tìm ảnh báo chí bổ trợ
  if (rawImagePaths.length === 0 && savedVideos.length === 0 && fallbackQuery && typeof searchNewsImagesFn === 'function') {
    console.log(`🔍 Bài viết không có tư liệu sẵn, đang tìm kiếm ảnh báo chí thực tế cho: "${fallbackQuery.slice(0, 60)}"...`);
    const searched = await searchNewsImagesFn(fallbackQuery);
    for (let i = 0; i < searched.length && rawImagePaths.length < 6; i++) {
      const imgUrl = searched[i];
      const rawPath = path.join(outDir, `raw_${rawImagePaths.length}.jpg`);
      try {
        const res = await fetch(imgUrl, { headers: { 'User-Agent': ua } });
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength < 15 * 1024) continue;
        fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));
        try {
          validateImageWithPython(pythonBin, rawPath);
          rawImagePaths.push(rawPath);
          console.log(`  [Ảnh tìm kiếm ${rawImagePaths.length}] Tải thành công: ${imgUrl.slice(0, 80)}...`);
        } catch {
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        }
      } catch {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      }
    }
  }

  // 4. Crop TẤT CẢ ảnh đã tải sang chuẩn 1080x1040 (chỉ sinh biến thể zoom nếu tổng tư liệu < 4)
  let savedImages = [];
  if (rawImagePaths.length > 0) {
    const minNeededImages = Math.max(0, 4 - savedVideos.length);
    try {
      savedImages = cropAllImagesWithPython(pythonBin, rawImagePaths, outDir, minNeededImages);
    } catch (e) {
      console.error('Lỗi crop ảnh bài báo:', e.message);
    }
  }

  // 5. Fallback cực đoan nếu không có ảnh và cũng không có video
  if (savedImages.length === 0 && savedVideos.length === 0) {
    for (let i = 0; i < 4; i++) {
      const cropPath = path.join(outDir, `crop_${i}.jpg`);
      if (fallbackImageSource && fs.existsSync(fallbackImageSource)) {
        fs.copyFileSync(fallbackImageSource, cropPath);
      }
      savedImages.push(`crop_${i}.jpg`);
    }
  }

  // 6. Kết hợp đầy đủ tất cả ảnh + video vào danh sách mediaItems (đan xen hợp lý để video xuất hiện đều các cảnh)
  const imageItems = savedImages.map((src) => ({ type: 'image', src }));
  const mediaItems = interleaveMedia(imageItems, savedVideos);

  return {
    mediaItems,
    savedImages,
    savedVideos,
    rawImageCount: rawImagePaths.length,
    rawVideoCount: savedVideos.length,
  };
}

/**
 * Đan xen video và ảnh một cách tự nhiên sao cho mọi ảnh và mọi video đều xuất hiện,
 * không bị dồn hết video vào một cảnh duy nhất.
 */
export function interleaveMedia(imageItems = [], videoItems = []) {
  if (videoItems.length === 0) return [...imageItems];
  if (imageItems.length === 0) return [...videoItems];

  const result = [];
  const total = imageItems.length + videoItems.length;
  // Đặt video xen kẽ đều theo tỷ lệ
  const step = total / videoItems.length;
  const videoSlots = new Set();
  for (let v = 0; v < videoItems.length; v++) {
    // Ưu tiên đưa video đầu tiên xuất hiện sớm (ngay cảnh 1 hoặc 2) để hút mắt
    const slot = Math.min(total - 1, Math.floor(v * step + (imageItems.length > 0 ? 1 : 0)));
    videoSlots.add(slot);
  }

  let imgIdx = 0;
  let vidIdx = 0;
  for (let i = 0; i < total; i++) {
    if (videoSlots.has(i) && vidIdx < videoItems.length) {
      result.push(videoItems[vidIdx++]);
    } else if (imgIdx < imageItems.length) {
      result.push(imageItems[imgIdx++]);
    } else if (vidIdx < videoItems.length) {
      result.push(videoItems[vidIdx++]);
    }
  }
  while (imgIdx < imageItems.length) result.push(imageItems[imgIdx++]);
  while (vidIdx < videoItems.length) result.push(videoItems[vidIdx++]);

  return result;
}

/**
 * Phân bổ TOÀN BỘ tư liệu (ảnh + video) đều vào 4 cảnh.
 * Đảm bảo 100% tư liệu đã tải đều được đưa vào video, không bỏ sót bất kỳ ảnh/video nào!
 */
export function distributeMediaToScenes(mediaItems, sceneCount = 4) {
  const scenes = Array.from({ length: sceneCount }, () => []);
  if (!mediaItems || mediaItems.length === 0) {
    return scenes.map(() => [{ type: 'image', src: 'crop_0.jpg' }]);
  }

  if (mediaItems.length >= sceneCount) {
    const base = Math.floor(mediaItems.length / sceneCount);
    const rem = mediaItems.length % sceneCount;
    let cursor = 0;
    for (let s = 0; s < sceneCount; s++) {
      const count = base + (s < rem ? 1 : 0);
      scenes[s] = mediaItems.slice(cursor, cursor + count);
      cursor += count;
    }
    return scenes;
  }

  // Trường hợp hiếm: tổng tư liệu ít hơn số cảnh (< 4) -> trải đều vòng tròn
  for (let s = 0; s < sceneCount; s++) {
    scenes[s] = [mediaItems[s % mediaItems.length]];
  }
  return scenes;
}
