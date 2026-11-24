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
 * Nâng cấp URL ảnh từ thumbnail/preview lên bản master gốc độ phân giải cao nhất
 * (bỏ các tiền tố /thumb_w/, /zoom/, query width nhỏ của các báo chí Việt Nam và CMS)
 */
export function upgradeToMasterImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let clean = url;

  // 1. Dân Trí / Tuổi Trẻ / VCCorp mediacdn / Kênh 14 / CafeF: loại bỏ /thumb_w/\d+/ và /zoom/\d+_\d+/
  if (
    clean.includes('dantri.com.vn') ||
    clean.includes('tuoitre.vn') ||
    clean.includes('mediacdn.vn') ||
    clean.includes('kenh14cdn.com') ||
    clean.includes('cafefcdn.com') ||
    clean.includes('sohacdn.com')
  ) {
    clean = clean.replace(/\/thumb_w\/\d+\//i, '/');
    clean = clean.replace(/\/(?:_zoom|zoom)\/\d+_\d+\//i, '/');
  }

  // 2. VietnamNet (vnncdn) / Thanh Niên / Tiền Phong: bỏ resize query params nếu không có signature
  if (clean.includes('vnncdn.net') || clean.includes('thanhnien.vn') || clean.includes('tienphong.vn')) {
    clean = clean.replace(/[?&](?:width|w|maxwidth)=\d+/gi, '');
    clean = clean.replace(/\?&/, '?').replace(/[?&]$/, '');
  }

  // 3. WordPress & CMS thumbnail suffixes: -300x200.jpg, -768x432.png, _thumb.jpg, -thumb.jpg
  clean = clean.replace(/-\d{3,4}x\d{3,4}(\.[a-zA-Z0-9]+(?:\?.*)?)$/i, '$1');
  clean = clean.replace(/[-_]thumb(\.[a-zA-Z0-9]+(?:\?.*)?)$/i, '$1');

  return clean;
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

export function cleanCaptionText(raw = '') {
  if (!raw || typeof raw !== 'string') return '';
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\((?:Ảnh|Nguồn|Photo|Clip|Theo|Đồ họa)[:\s][^)]*\)/gi, '')
    .replace(/^(?:Ảnh|Nguồn|Photo|Clip|Đồ họa)[:\s].*$/gi, '')
    .trim();
}

export function isChartOrInfographicMeta(caption = '', urlOrSrc = '') {
  const text = `${caption} ${urlOrSrc}`.toLowerCase();
  const keywords = [
    'bieu-do', 'bieudo', 'bieu_do', 'biểu đồ', 'chart', 'infographic',
    'so-do', 'sodo', 'so_do', 'sơ đồ', 'do-thi', 'dothi', 'do_thi', 'đồ thị',
    'bang-gia', 'banggia', 'bang_gia', 'bảng giá', 'thong-ke', 'thongke', 'thống kê',
    'bang-so-lieu', 'bang_so_lieu', 'bảng số liệu', 'diagram', 'table', 'graph',
    'so-sanh', 'sosanh', 'so sánh', 'ti-gia', 'ty-gia', 'tỷ giá', 'lai-suat', 'lãi suất',
    'gdp', 'cpi'
  ];
  return keywords.some((k) => text.includes(k));
}

function extractCaptionFromBlock(blockHtml, fallbackAlt = '') {
  if (!blockHtml) return cleanCaptionText(fallbackAlt);
  const figcap = blockHtml.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
  if (figcap) {
    const text = cleanCaptionText(figcap[1]);
    if (text) return text;
  }
  const capDiv = blockHtml.match(
    /<(?:div|p|span)\b[^>]*class=["'][^"']*(?:caption|description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i
  );
  if (capDiv) {
    const text = cleanCaptionText(capDiv[1]);
    if (text) return text;
  }
  return cleanCaptionText(fallbackAlt);
}

function addUniqueImage(list, rawUrl, baseUrl, caption = '', captionMap = null) {
  const url = normalizeMediaUrl(rawUrl, baseUrl);
  if (!url || isBadImageUrl(url)) return;
  const upgraded = upgradeToMasterImageUrl(url);
  const existing = list.find((e) => isSameImage(e, upgraded) || isSameImage(e, url));
  if (existing) {
    if (caption && captionMap && !captionMap.get(existing)) {
      captionMap.set(existing, caption);
    }
    return;
  }
  list.push(upgraded);
  if (caption && captionMap) {
    captionMap.set(upgraded, caption);
  }
}

function scanImagesInChunk(chunk, baseUrl, captionMap = null) {
  const found = [];

  // 1. Quét các khối có kèm chú thích trước (<figure>...</figure> hoặc <div type="Photo">...</div>)
  const blockRegex = /<(?:figure|div)\b[^>]*(?:class=["'][^"']*(?:image|tplCaption|VCSortableInPreviewMode|Photo)[^"']*|type=["']Photo["'])[^>]*>([\s\S]*?)<\/(?:figure|div)>/gi;
  let bm;
  while ((bm = blockRegex.exec(chunk)) !== null) {
    const blockContent = bm[0];
    const innerImg = blockContent.match(/<img\b([^>]*)>/i);
    const altText = innerImg ? (getAttr(innerImg[1], 'alt') || getAttr(innerImg[1], 'title')) : '';
    const blockCaption = extractCaptionFromBlock(blockContent, altText);

    // Lấy ảnh trong khối này
    const sourceRegex = /<source\b([^>]*)>/gi;
    let sm;
    let addedFromBlock = false;
    while ((sm = sourceRegex.exec(blockContent)) !== null) {
      const sAttrs = sm[1];
      const best =
        parseBestFromSrcset(getAttr(sAttrs, 'data-srcset'), baseUrl) ||
        parseBestFromSrcset(getAttr(sAttrs, 'srcset'), baseUrl) ||
        normalizeMediaUrl(getAttr(sAttrs, 'data-src') || getAttr(sAttrs, 'src'), baseUrl);
      if (best && !isBadImageUrl(best)) {
        addUniqueImage(found, best, baseUrl, blockCaption, captionMap);
        addedFromBlock = true;
        break;
      }
    }

    if (innerImg) {
      const iAttrs = innerImg[1];
      const clsId = `${getAttr(iAttrs, 'class')} ${getAttr(iAttrs, 'id')}`;
      if (!BAD_CLASS_OR_ID_REGEX.test(clsId)) {
        const orig =
          getAttr(iAttrs, 'data-original') ||
          getAttr(iAttrs, 'data-full-src') ||
          getAttr(iAttrs, 'data-large-src') ||
          getAttr(iAttrs, 'data-zoom-src') ||
          getAttr(iAttrs, 'data-high-res-src') ||
          getAttr(iAttrs, 'data-lazy-src') ||
          getAttr(iAttrs, 'data-src') ||
          parseBestFromSrcset(getAttr(iAttrs, 'data-srcset'), baseUrl) ||
          parseBestFromSrcset(getAttr(iAttrs, 'srcset'), baseUrl) ||
          getAttr(iAttrs, 'src');
        if (orig) {
          addUniqueImage(found, orig, baseUrl, blockCaption, captionMap);
          addedFromBlock = true;
        }
      }
    }
  }

  // 2. Quét <picture>...</picture> còn lại
  const pictureRegex = /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi;
  let pm;
  while ((pm = pictureRegex.exec(chunk)) !== null) {
    const inner = pm[1];
    const innerImg = inner.match(/<img\b([^>]*)>/i);
    const altText = innerImg ? (getAttr(innerImg[1], 'alt') || getAttr(innerImg[1], 'title')) : '';
    const caption = cleanCaptionText(altText);

    if (innerImg) {
      const clsId = `${getAttr(innerImg[1], 'class')} ${getAttr(innerImg[1], 'id')}`;
      if (BAD_CLASS_OR_ID_REGEX.test(clsId)) continue;
    }

    if (innerImg) {
      const orig =
        getAttr(innerImg[1], 'data-original') ||
        getAttr(innerImg[1], 'data-full-src') ||
        getAttr(innerImg[1], 'data-large-src') ||
        getAttr(innerImg[1], 'data-zoom-src');
      if (orig) {
        addUniqueImage(found, orig, baseUrl, caption, captionMap);
        continue;
      }
    }

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
        addUniqueImage(found, best, baseUrl, caption, captionMap);
        gotFromSource = true;
        break;
      }
    }
    if (gotFromSource) continue;

    if (innerImg) {
      const iAttrs = innerImg[1];
      const cand =
        getAttr(iAttrs, 'data-lazy-src') ||
        getAttr(iAttrs, 'data-src') ||
        parseBestFromSrcset(getAttr(iAttrs, 'data-srcset'), baseUrl) ||
        parseBestFromSrcset(getAttr(iAttrs, 'srcset'), baseUrl) ||
        getAttr(iAttrs, 'src');
      if (cand) addUniqueImage(found, cand, baseUrl, caption, captionMap);
    }
  }

  // 3. Quét tất cả thẻ <img> còn lại trong chunk
  const imgTagRegex = /<img\b([^>]*)>/gi;
  let im;
  while ((im = imgTagRegex.exec(chunk)) !== null) {
    const attrs = im[1];
    const clsId = `${getAttr(attrs, 'class')} ${getAttr(attrs, 'id')}`;
    if (BAD_CLASS_OR_ID_REGEX.test(clsId)) continue;
    const caption = cleanCaptionText(getAttr(attrs, 'alt') || getAttr(attrs, 'title'));

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
        addUniqueImage(found, normalized, baseUrl, caption, captionMap);
        break;
      }
    }
  }

  // 4. Quét các link lightbox / gallery ảnh gốc (<a href="...jpg|png|webp">)
  const linkImgRegex = /<a\b([^>]*)>/gi;
  let lm;
  while ((lm = linkImgRegex.exec(chunk)) !== null) {
    const attrs = lm[1];
    const href = getAttr(attrs, 'href') || getAttr(attrs, 'data-src');
    if (href && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(decodeHtmlEntities(href))) {
      addUniqueImage(found, href, baseUrl, '', captionMap);
    }
  }

  // 5. Poster từ thẻ <video poster="..."> (nếu cần bổ sung tư liệu ảnh)
  const videoPosterRegex = /<video\b([^>]*)>/gi;
  let vm;
  while ((vm = videoPosterRegex.exec(chunk)) !== null) {
    const poster = getAttr(vm[1], 'poster') || getAttr(vm[1], 'data-poster');
    if (poster) addUniqueImage(found, poster, baseUrl, 'Ảnh bìa video tư liệu', captionMap);
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
 * Trích xuất TẤT CẢ ảnh báo chí từ bài viết kèm bản đồ chú thích ảnh (captionMap)
 */
export function extractImagesFromHtml(contentHtml, fullHtml, baseUrl = '', maxImages = 24) {
  const captionMap = new Map();
  const images = scanImagesInChunk(contentHtml, baseUrl, captionMap);

  // Nếu vùng thân bài chỉ trích xuất được <= 1 ảnh (ví dụ bài Photo Story, bài đa phương tiện có gallery nằm ngoài div text),
  // quét bổ sung tất cả <figure> và <picture> trong toàn trang (đã lọc bỏ header/footer/nav/sidebar/related).
  if (images.length <= 1 && fullHtml) {
    const cleanedFull = stripNoiseBlocks(fullHtml);
    const figureMatches = cleanedFull.match(/<(?:figure|picture)\b[^>]*>[\s\S]*?<\/(?:figure|picture)>/gi) || [];
    for (const fig of figureMatches) {
      const figImgs = scanImagesInChunk(fig, baseUrl, captionMap);
      for (const u of figImgs) {
        addUniqueImage(images, u, baseUrl, captionMap.get(u) || '', captionMap);
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
          if (typeof item === 'string') addUniqueImage(images, item, baseUrl, '', captionMap);
          else if (item && typeof item === 'object' && item.url) addUniqueImage(images, item.url, baseUrl, item.caption || '', captionMap);
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
        if (content) addUniqueImage(images, content, baseUrl, 'Ảnh đại diện bài báo', captionMap);
      }
    }
    const linkRegex = /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi;
    let lm;
    while ((lm = linkRegex.exec(fullHtml)) !== null) {
      addUniqueImage(images, lm[1], baseUrl, '', captionMap);
    }
  }

  const sliced = images.slice(0, maxImages);
  sliced.captionMap = captionMap;
  return sliced;
}

/**
 * Trích xuất danh mục tư liệu đầy đủ kèm chú thích và phân loại biểu đồ
 */
export function extractMediaCatalog(contentHtml, fullHtml, baseUrl = '') {
  const imgUrls = extractImagesFromHtml(contentHtml, fullHtml, baseUrl);
  const videoUrls = extractVideosFromHtml(contentHtml, fullHtml, baseUrl);
  const captionMap = imgUrls.captionMap || new Map();
  const catalog = [];

  for (const u of imgUrls) {
    const caption = captionMap.get(u) || '';
    catalog.push({
      type: 'image',
      url: u,
      caption,
      isChart: isChartOrInfographicMeta(caption, u),
    });
  }

  for (const v of videoUrls) {
    catalog.push({
      type: 'video',
      url: v,
      caption: 'Video tư liệu hiện trường',
      isChart: false,
    });
  }

  return catalog;
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
    'if w < 450 or h < 300: sys.exit(1)',
    'ratio = w / h',
    'if ratio < 0.30 or ratio > 3.2: sys.exit(1)',
  ].join('\n');

  execFileSync(pythonBin, ['-c', pyCode, rawPath], { stdio: 'ignore' });
}

export function cropAllImagesWithPython(pythonBin, rawPaths, outDir, minOutputs = 4) {
  const pyCode = `
import json, os, sys
from PIL import Image, ImageFilter, ImageEnhance

raw_paths = json.loads(sys.argv[1])
out_dir = sys.argv[2]
min_outputs = int(sys.argv[3])

target_w, target_h = 1080, 1040
target_ratio = target_w / target_h

def is_chart_or_infographic(im, path_str):
    p_lower = path_str.lower()
    chart_keywords = [
        'bieu-do', 'bieudo', 'bieu_do', 'chart', 'infographic',
        'so-do', 'sodo', 'so_do', 'do-thi', 'dothi', 'do_thi',
        'bang-gia', 'banggia', 'bang_gia', 'thong-ke', 'thongke', 'thong_ke',
        'bang-so-lieu', 'bang_so_lieu', 'diagram', 'table', 'graph', 'figure',
        'truc-quan', 'timeline', 'so-sanh', 'sosanh', 'so-lieu', 'solieu',
        'gdp', 'cpi', 'lai-suat', 'ti-gia', 'ty-gia', 'chungkhoan', 'gia-vang'
    ]
    if any(k in p_lower for k in chart_keywords):
        return True

    w, h = im.size
    ratio = w / h

    # Nếu tỉ lệ lệch khỏi khung vuông (rộng >= 1.35 hoặc cao <= 0.82)
    # Kiểm tra màu nền sáng/đơn sắc đặc trưng của biểu đồ & bảng dữ liệu
    if ratio >= 1.35 or ratio <= 0.82:
        try:
            im_rgb = im.convert('RGB')
            corners = [
                im_rgb.getpixel((min(10, w - 1), min(10, h - 1))),
                im_rgb.getpixel((max(0, w - 11), min(10, h - 1))),
                im_rgb.getpixel((min(10, w - 1), max(0, h - 11))),
                im_rgb.getpixel((max(0, w - 11), max(0, h - 11)))
            ]
            white_corners = sum(1 for (r, g, b) in corners if r > 230 and g > 230 and b > 230)
            if white_corners >= 2:
                return True
            c0 = corners[0]
            corner_diff = sum(abs(c[0]-c0[0]) + abs(c[1]-c0[1]) + abs(c[2]-c0[2]) for c in corners)
            if corner_diff < 40 and (ratio >= 1.45 or ratio <= 0.75):
                return True
        except Exception:
            pass

    # Nếu tỉ lệ cực rộng (>= 1.60 như 16:9, 18:9, 21:9) hoặc cực hẹp (<= 0.65):
    # center-crop sẽ cắt mất 38%-50% hình ảnh! Dùng smart fit để bảo toàn toàn bộ ảnh!
    if ratio >= 1.60 or ratio <= 0.65:
        return True

    return False

def make_smart_fit(im):
    w, h = im.size
    # 1. Nền mờ đồng bộ màu (ambient Gaussian blur backdrop)
    if w / h > target_ratio:
        nw = int(h * target_ratio)
        left = (w - nw) // 2
        bg_crop = im.crop((left, 0, left + nw, h))
    else:
        nh = int(w / target_ratio)
        top = (h - nh) // 2
        bg_crop = im.crop((0, top, w, top + nh))

    bg = bg_crop.resize((target_w, target_h), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=32))
    bg = ImageEnhance.Brightness(bg).enhance(0.68)

    # 2. Tiền cảnh: Giữ nguyên 100% biểu đồ / ảnh gốc, scale vừa vặn trong safe zone
    max_w, max_h = 1040, 990
    scale = min(max_w / w, max_h / h)
    fw = int(w * scale)
    fh = int(h * scale)
    fg = im.resize((fw, fh), Image.Resampling.LANCZOS)
    fg = fg.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=2))

    # 3. Căn giữa hoàn hảo
    pos_x = (target_w - fw) // 2
    pos_y = (target_h - fh) // 2
    if fg.mode in ('RGBA', 'LA') or (fg.mode == 'P' and 'transparency' in fg.info):
        bg.paste(fg, (pos_x, pos_y), fg.convert('RGBA'))
    else:
        bg.paste(fg, (pos_x, pos_y))

    return bg.convert('RGB')

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
    c_res = c.resize((target_w, target_h), Image.Resampling.LANCZOS).convert('RGB')
    return c_res.filter(ImageFilter.UnsharpMask(radius=1.0, percent=90, threshold=2))

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
is_fitted_list = []

for idx, rp in enumerate(raw_paths):
    try:
        im = Image.open(rp)
        is_fit = is_chart_or_infographic(im, rp)
        if is_fit:
            b = make_smart_fit(im)
        else:
            b = make_center_crop(im)
        fname = f'crop_{len(saved)}.jpg'
        b.save(os.path.join(out_dir, fname), quality=95)
        bases.append(b)
        is_fitted_list.append(is_fit)
        saved.append(fname)
    except Exception:
        pass

# Chỉ tạo thêm biến thể zoom nhẹ nếu tổng tư liệu ảnh quá ít (< min_outputs)
if len(bases) > 0 and len(saved) < min_outputs:
    zoom_factors = [0.85, 0.78, 0.88]
    zi = 0
    while len(saved) < min_outputs:
        base_idx = zi % len(bases)
        base = bases[base_idx]
        is_fit = is_fitted_list[base_idx]
        fname = f'crop_{len(saved)}.jpg'
        if is_fit:
            # Biểu đồ/đồ họa: giữ nguyên toàn vẹn không zoom-crop làm mất số liệu
            base.save(os.path.join(out_dir, fname), quality=95)
        elif zi == 2 and len(bases) == 1:
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
  captionMap = null,
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const pythonBin = detectPythonBin();
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const captionLookup = captionMap || (imgUrls && imgUrls.captionMap ? imgUrls.captionMap : new Map());
  const rawImagePaths = [];
  const rawImageOrigins = [];
  const savedVideos = [];

  // 1. Tải TẤT CẢ video tư liệu từ bài viết (nếu có)
  for (let i = 0; i < videoUrls.length && savedVideos.length < maxVideos; i++) {
    const vUrl = videoUrls[i];
    const vidFilename = `video_${savedVideos.length}.mp4`;
    const vidPath = path.join(outDir, vidFilename);
    try {
      console.log(`  [Video tư liệu ${savedVideos.length + 1}/${Math.min(videoUrls.length, maxVideos)}] Đang tải: ${vUrl.slice(0, 80)}...`);
      const durationSec = await downloadAndNormalizeVideo(vUrl, vidPath, articleUrl);
      savedVideos.push({
        type: 'video',
        src: vidFilename,
        durationSec,
        caption: 'Video tư liệu hiện trường',
        isChart: false,
      });
      console.log(`  ✅ [Video tư liệu ${savedVideos.length}] Thành công (${durationSec.toFixed(1)}s): ${vidFilename}`);
    } catch (err) {
      console.warn(`  ⚠️ Bỏ qua video lỗi (${vUrl.slice(0, 60)}):`, err.message);
      if (fs.existsSync(vidPath)) fs.unlinkSync(vidPath);
    }
  }

  // 2. Tải TẤT CẢ ảnh báo chí từ bài viết (ưu tiên bản master chất lượng cao nhất)
  for (let i = 0; i < imgUrls.length && rawImagePaths.length < maxImages; i++) {
    const originalUrl = imgUrls[i];
    const candidateUrls = [originalUrl];
    const upgraded = upgradeToMasterImageUrl(originalUrl);
    if (upgraded && upgraded !== originalUrl) {
      candidateUrls.unshift(upgraded); // Thử bản master độ phân giải cao trước
    }

    const rawPath = path.join(outDir, `raw_${rawImagePaths.length}.jpg`);

    for (const fetchUrl of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const headers = {
          'User-Agent': ua,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        };
        if (articleUrl) headers.Referer = articleUrl;

        const res = await fetch(fetchUrl, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) continue;

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength < 12 * 1024) continue; // Bỏ qua icon/ảnh < 12KB

        fs.writeFileSync(rawPath, Buffer.from(arrayBuffer));

        try {
          validateImageWithPython(pythonBin, rawPath);
          rawImagePaths.push(rawPath);
          const itemCaption = captionLookup.get(originalUrl) || captionLookup.get(fetchUrl) || '';
          rawImageOrigins.push({
            fetchUrl,
            originalUrl,
            caption: itemCaption,
          });
          console.log(`  [Ảnh báo chí ${rawImagePaths.length}] Tải thành công: ${fetchUrl.slice(0, 80)}...`);
          break; // Đã tải xong ảnh hợp lệ, chuyển sang ảnh tiếp theo
        } catch {
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        }
      } catch {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      }
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
          rawImageOrigins.push({
            fetchUrl: imgUrl,
            originalUrl: imgUrl,
            caption: fallbackQuery,
          });
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

  // 6. Kết hợp đầy đủ tất cả ảnh + video vào danh sách mediaItems kèm chú thích và nhận diện biểu đồ
  const imageItems = savedImages.map((src, idx) => {
    const origin = rawImageOrigins[idx % Math.max(1, rawImageOrigins.length)] || {};
    const caption = origin.caption || '';
    return {
      type: 'image',
      src,
      caption,
      isChart: isChartOrInfographicMeta(caption, src),
    };
  });
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
 * Tính điểm độ phù hợp giữa một tư liệu và một cảnh trong kịch bản
 */
export function scoreMediaForScene(item, scene, sceneIndex = 0) {
  const itemText = `${item.caption || ''} ${item.src || ''}`.toLowerCase();
  const sceneText = `${scene.title || ''} ${scene.subtitle || ''} ${scene.text || ''}`.toLowerCase();
  let score = 0;

  // A. Biểu đồ / Bảng số liệu / Thống kê -> Ưu tiên cảnh nói về số liệu/tiền tệ/thuế/giá
  const isChart = item.isChart || isChartOrInfographicMeta(item.caption, item.src);
  if (isChart) {
    const chartKeywords = [
      '%', 'phần trăm', 'tỷ', 'triệu', 'đồng', 'usd', 'giá', 'thuế', 'mức',
      'tăng', 'giảm', 'biến động', 'số liệu', 'thống kê', 'doanh thu', 'lợi nhuận',
      'độ c', 'mm', 'nhiệt độ', 'lượng mưa'
    ];
    const matchCount = chartKeywords.filter((k) => sceneText.includes(k)).length;
    score += matchCount * 6;
    if (matchCount > 0) score += 20; // Boost lớn cho cảnh nói về con số định lượng
  }

  // B. Bắt bớ / Khởi tố / Công an / Hiện trường điều tra
  const crimeKeywords = ['bắt', 'tạm giam', 'công an', 'cảnh sát', 'khởi tố', 'điều tra', 'tang vật', 'hành vi', 'vi phạm'];
  if (crimeKeywords.some((k) => itemText.includes(k))) {
    const count = crimeKeywords.filter((k) => sceneText.includes(k)).length;
    score += count * 8;
  }

  // C. Tòa án / Phiên tòa / Bị cáo / Xét xử
  const courtKeywords = ['tòa án', 'xét xử', 'bị cáo', 'hội đồng', 'viện kiểm sát', 'tuyên phạt', 'tù', 'án'];
  if (courtKeywords.some((k) => itemText.includes(k))) {
    const count = courtKeywords.filter((k) => sceneText.includes(k)).length;
    score += count * 8;
  }

  // D. Cấp cứu / Bệnh viện / Nạn nhân / Y tế
  const medicalKeywords = ['cấp cứu', 'bệnh viện', 'nạn nhân', 'bị thương', 'tử vong', 'thiệt mạng', 'cứu hộ', 'y tế'];
  if (medicalKeywords.some((k) => itemText.includes(k))) {
    const count = medicalKeywords.filter((k) => sceneText.includes(k)).length;
    score += count * 8;
  }

  // E. Hiện trường / Tai nạn / Vụ cháy / Toàn cảnh (Ưu tiên cảnh 1 Hook mở đầu)
  const hookKeywords = ['toàn cảnh', 'hiện trường', 'tai nạn', 'cháy', 'sập', 'khẩn cấp', 'vụ việc', 'sự cố'];
  if (hookKeywords.some((k) => itemText.includes(k))) {
    if (sceneIndex === 0) score += 12;
    const count = hookKeywords.filter((k) => sceneText.includes(k)).length;
    score += count * 5;
  }

  // F. Trùng từ vựng danh từ riêng (>= 4 ký tự)
  const words = itemText
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  for (const w of words) {
    if (sceneText.includes(w)) {
      score += 4;
    }
  }

  // G. Video tư liệu: ưu tiên cảnh 1 hoặc 2 để thu hút retention
  if (item.type === 'video') {
    if (sceneIndex <= 1) score += 8;
  }

  return score;
}

/**
 * Thuật toán ghép nối ngữ nghĩa thông minh giữa tư liệu và các cảnh
 */
export function matchMediaSemantically(mediaItems, scriptScenes) {
  const sceneCount = 4;
  const scenes = Array.from({ length: sceneCount }, () => []);
  if (!mediaItems || mediaItems.length === 0) {
    return scenes.map(() => [{ type: 'image', src: 'crop_0.jpg' }]);
  }

  const scores = mediaItems.map((item) =>
    scriptScenes.map((scene, sIdx) => scoreMediaForScene(item, scene, sIdx))
  );

  const assigned = new Set();

  // 1. Gán biểu đồ vào cảnh nói về số liệu / thống kê / thuế suất
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    if (item.isChart || isChartOrInfographicMeta(item.caption, item.src)) {
      let bestScene = 2; // Thường cảnh 3 nói về số liệu
      let maxScore = -1;
      for (let s = 0; s < sceneCount; s++) {
        if (scores[i][s] > maxScore) {
          maxScore = scores[i][s];
          bestScene = s;
        }
      }
      scenes[bestScene].push(item);
      assigned.add(i);
      break;
    }
  }

  // 2. Gán 1 tư liệu phù hợp nhất cho các cảnh còn trống
  for (let s = 0; s < sceneCount; s++) {
    if (scenes[s].length > 0) continue;
    let bestItem = -1;
    let maxScore = -Infinity;
    for (let i = 0; i < mediaItems.length; i++) {
      if (assigned.has(i)) continue;
      if (scores[i][s] > maxScore) {
        maxScore = scores[i][s];
        bestItem = i;
      }
    }
    if (bestItem !== -1) {
      scenes[s].push(mediaItems[bestItem]);
      assigned.add(bestItem);
    }
  }

  // 3. Phân bổ các tư liệu còn lại (đảm bảo không sót bất kỳ tư liệu nào)
  for (let i = 0; i < mediaItems.length; i++) {
    if (assigned.has(i)) continue;
    let bestScene = 0;
    let maxScore = -Infinity;
    for (let s = 0; s < sceneCount; s++) {
      // Ưu tiên cảnh có ít tư liệu và điểm cao
      const adjusted = scores[i][s] - scenes[s].length * 6;
      if (adjusted > maxScore) {
        maxScore = adjusted;
        bestScene = s;
      }
    }
    scenes[bestScene].push(mediaItems[i]);
    assigned.add(i);
  }

  // 4. Bảo đảm không cảnh nào bị rỗng (ít nhất 1 tư liệu / cảnh)
  for (let s = 0; s < sceneCount; s++) {
    if (scenes[s].length === 0) {
      const donor = scenes.find((list) => list.length >= 2);
      if (donor) {
        scenes[s].push(donor.pop());
      } else {
        scenes[s].push(mediaItems[s % mediaItems.length]);
      }
    }
  }

  return scenes;
}

/**
 * Đồng bộ hóa tư liệu vào 4 cảnh (kết hợp chỉ định của AI và đối soát ngữ nghĩa)
 * ĐẢM BẢO: NÓI ĐẾN ĐÂU - ĐÚNG ẢNH ĐÓ - ĐÚNG TIÊU ĐỀ ĐÓ!
 */
export function syncMediaToScenes(mediaItems, scriptScenes = []) {
  const sceneCount = 4;
  if (!mediaItems || mediaItems.length === 0) {
    return Array.from({ length: sceneCount }, () => [{ type: 'image', src: 'crop_0.jpg' }]);
  }

  if (!scriptScenes || scriptScenes.length === 0) {
    return distributeMediaToScenes(mediaItems, sceneCount);
  }

  // Kiểm tra nếu kịch bản AI đã trả về mediaIndices hợp lệ
  const assignedByAi = Array.from({ length: sceneCount }, () => []);
  const used = new Set();
  let aiCount = 0;

  for (let s = 0; s < Math.min(scriptScenes.length, sceneCount); s++) {
    const sc = scriptScenes[s];
    if (Array.isArray(sc.mediaIndices) && sc.mediaIndices.length > 0) {
      for (const idx of sc.mediaIndices) {
        if (Number.isInteger(idx) && idx >= 0 && idx < mediaItems.length && !used.has(idx)) {
          assignedByAi[s].push(mediaItems[idx]);
          used.add(idx);
          aiCount++;
        }
      }
    }
  }

  // Nếu AI đã chỉ định hợp lệ cho ít nhất 2 cảnh, tôn trọng chỉ định của AI và san sẻ nốt phần còn lại
  if (aiCount >= 2) {
    const unused = mediaItems.filter((_, idx) => !used.has(idx));
    for (const it of unused) {
      let minLen = Infinity;
      let targetScene = 0;
      for (let s = 0; s < sceneCount; s++) {
        if (assignedByAi[s].length < minLen) {
          minLen = assignedByAi[s].length;
          targetScene = s;
        }
      }
      assignedByAi[targetScene].push(it);
    }
    for (let s = 0; s < sceneCount; s++) {
      if (assignedByAi[s].length === 0) {
        const donor = assignedByAi.find((list) => list.length >= 2);
        if (donor) assignedByAi[s].push(donor.pop());
        else assignedByAi[s].push(mediaItems[s % mediaItems.length]);
      }
    }
    return assignedByAi;
  }

  // Ngược lại, kích hoạt bộ phân tích Semantic Matching tự động
  return matchMediaSemantically(mediaItems, scriptScenes);
}

/**
 * Phân bổ tư liệu đều vào 4 cảnh (hỗ trợ cả tham số sceneCount dạng số hoặc mảng scriptScenes)
 */
export function distributeMediaToScenes(mediaItems, scenesOrCount = 4) {
  if (Array.isArray(scenesOrCount)) {
    return syncMediaToScenes(mediaItems, scenesOrCount);
  }
  const sceneCount = typeof scenesOrCount === 'number' ? scenesOrCount : 4;
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

  // Trường hợp ít hơn 4 tư liệu -> trải đều vòng tròn
  for (let s = 0; s < sceneCount; s++) {
    scenes[s] = [mediaItems[s % mediaItems.length]];
  }
  return scenes;
}
