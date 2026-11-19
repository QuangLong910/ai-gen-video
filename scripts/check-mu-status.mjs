import https from 'https';
import fs from 'fs';

const URL = 'https://www.24h.com.vn/bong-da/truc-tiep-bong-da-mu-aston-villa-quy-do-phai-gianh-3-diem-ngoai-hang-anh-c48a1809405.html';

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

export async function checkMatch() {
  const html = await fetchUrl(URL);
  if (!html) return { status: 'error', message: 'Cannot fetch page' };

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Extract article body
  const article = html.match(/<article[\s\S]*?<\/article>/)?.[0] || '';

  // Check if title or article indicates full-time
  const titleIsFT = /\(Hết giờ\)|\(FT\)|Kết quả bóng đá/i.test(title);
  const articleIsFT = /HẾT GIỜ!|Trận đấu kết thúc|Tiếng còi mãn cuộc/i.test(article);
  const isFullTime = titleIsFT || articleIsFT;

  const pMatches = article.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const textParas = pMatches.map((p) => p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

  const result = {
    title,
    isFullTime,
    timestamp: new Date().toISOString(),
    latestAction: textParas.slice(28, 35),
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

checkMatch();
