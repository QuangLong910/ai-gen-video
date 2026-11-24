import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficialNewsDomain,
  heuristicFactCheck,
  verifyAndFactCheckScript,
} from './fact-checker.mjs';

test('isOfficialNewsDomain nhận diện chính xác các cơ quan báo chí chính thống', () => {
  assert.equal(isOfficialNewsDomain('vietnamnet.vn'), true);
  assert.equal(isOfficialNewsDomain('https://dantri.com.vn/xa-hoi/tin-tuc.htm'), true);
  assert.equal(isOfficialNewsDomain('https://tuoitre.vn/phap-luat.htm'), true);
  assert.equal(isOfficialNewsDomain('vnexpress.net'), true);
  assert.equal(isOfficialNewsDomain('chinhphu.vn'), true);
  assert.equal(isOfficialNewsDomain('cand.com.vn'), true);
  assert.equal(isOfficialNewsDomain('nhandan.vn'), true);

  // Nguồn lạ không chính thống
  assert.equal(isOfficialNewsDomain('tin-don-nham-24h.com'), false);
  assert.equal(isOfficialNewsDomain('fake-news-channel.xyz'), false);
});

test('heuristicFactCheck tự động phát hiện và sửa từ khẩn cấp và nói quá trong tin thời tiết', () => {
  const articleData = {
    title: 'Không khí lạnh tăng cường, Bắc Bộ trời rét',
    domain: 'thethaovanhoa.vn',
    content: 'Theo Trung tâm Dự báo Khí tượng Thủy văn Quốc gia, không khí lạnh tiếp tục tăng cường, Bắc Bộ trời rét, riêng vùng núi có nơi rét đậm...',
  };

  const scriptData = {
    scenes: [
      {
        id: 1,
        text: 'Tin khẩn cấp! Không khí lạnh cực mạnh đang tràn về khiến toàn Bắc Bộ chuyển rét đậm rét hại!',
        title: 'KHÔNG KHÍ LẠNH',
        subtitle: 'Thời tiết chuyển biến',
        categoryTag: '🚨 TIN NÓNG',
      },
      {
        id: 2,
        text: 'Nhiệt độ giảm sâu nhiều nơi.',
        title: 'NHIỆT ĐỘ HẠ SÂU',
        subtitle: 'Trời rét buốt',
        categoryTag: '⚡ DIỄN BIẾN',
      },
      {
        id: 3,
        text: 'Mưa lớn tại miền Trung.',
        title: 'MƯA LỚN',
        subtitle: 'Cảnh báo mưa',
        categoryTag: '📌 CẢNH BÁO',
      },
      {
        id: 4,
        text: 'Hãy bấm theo dõi Hóng Hớt hai tư trên bảy để cập nhật tin mới nhất nhé!',
        title: 'THEO DÕI NGAY',
        subtitle: 'Cập nhật tin tức',
        categoryTag: '🔔 THEO DÕI',
      },
    ],
    captionTitle: 'Dự báo thời tiết',
    captionBody: 'Chi tiết đợt rét mới',
    hashtags: ['#tinnong', '#thoitiet'],
  };

  const res = heuristicFactCheck(articleData, scriptData);
  assert.equal(res.passed, false);
  assert.ok(res.issues.length >= 2);
  assert.ok(res.corrections.length >= 2);

  // Kịch bản đã hiệu đính không còn từ "khẩn cấp", "cực mạnh", "toàn Bắc Bộ chuyển rét đậm rét hại"
  const scene1 = res.scriptData.scenes[0];
  assert.ok(!scene1.text.includes('Tin khẩn cấp'));
  assert.ok(scene1.text.includes('Tin nóng!'));
  assert.ok(!scene1.text.includes('không khí lạnh cực mạnh'));
  assert.ok(scene1.text.includes('không khí lạnh tăng cường'));
  assert.ok(!scene1.text.includes('toàn Bắc Bộ chuyển rét đậm rét hại'));
  assert.ok(scene1.text.includes('Bắc Bộ trời rét, riêng vùng núi có nơi rét đậm'));
});

test('heuristicFactCheck tự động bổ sung mốc thời gian 1/7/2027 cho tin thuế đất bỏ hoang', () => {
  const articleData = {
    title: 'Quốc hội đồng ý áp thuế 0,2% với đất bỏ hoang',
    domain: 'vietnamnet.vn',
    content: 'Chiều 20/11, Quốc hội đồng ý bổ sung quy định áp thuế 0,2% với đất bỏ hoang, không đưa vào sử dụng. Quy định này chính thức áp dụng từ ngày 1/7/2027...',
  };

  const scriptData = {
    scenes: [
      { id: 1, text: 'Tin nóng! Quốc hội đồng ý áp thuế 0,2% với đất bỏ hoang.' },
      { id: 2, text: 'Quy định này nhằm hạn chế tình trạng đầu cơ lãng phí đất đai.' },
      { id: 3, text: 'Mức thuế suất 0,2% áp dụng cho đất chậm đưa vào sử dụng.' },
      { id: 4, text: 'Hãy theo dõi Hóng Hớt hai tư trên bảy nhé!' },
    ],
  };

  const res = heuristicFactCheck(articleData, scriptData);
  assert.equal(res.passed, false);
  assert.ok(res.corrections.some((c) => c.includes('1/7/2027')));

  // Cảnh 3 đã được tự động bổ sung mốc 1/7/2027
  assert.ok(res.scriptData.scenes[2].text.includes('1/7/2027') || res.scriptData.scenes[2].text.includes('1 tháng 7 năm 2027'));
});

test('heuristicFactCheck tự động bổ sung danh xưng cho tên người và hoàn thiện kết bài có đầu có cuối', () => {
  const articleData = {
    title: 'Bắt giữ đối tượng lừa đảo chiếm đoạt tài sản',
    domain: 'cand.com.vn',
    content: 'Cơ quan Cảnh sát điều tra Công an TP Hà Nội vừa bắt giữ đối tượng Nguyễn Văn Tuấn...',
  };

  const scriptData = {
    scenes: [
      { id: 1, text: 'Tin nóng! Công an quận vừa bắt giữ Tuấn vì hành vi lừa đảo qua mạng.' },
      { id: 2, text: 'Tuấn khai nhận đã tạo hàng loạt tài khoản ảo chiếm đoạt tiền của nhiều nạn nhân.' },
      { id: 3, text: 'Tang vật thu giữ gồm nhiều điện thoại và tài khoản ngân hàng.' },
      { id: 4, text: 'Hãy bấm theo dõi Hóng Hớt hai tư trên bảy để cập nhật tin mới nhất nhé!' },
    ],
  };

  const res = heuristicFactCheck(articleData, scriptData);
  assert.equal(res.passed, false);

  // Cảnh 1: Đã thêm "đối tượng" trước Tuấn
  assert.ok(res.scriptData.scenes[0].text.includes('bắt giữ đối tượng Tuấn'));

  // Cảnh 2: Đã thêm "Đối tượng" ở đầu câu
  assert.ok(res.scriptData.scenes[1].text.includes('Đối tượng Tuấn khai nhận'));

  // Cảnh 4: Đã có câu đúc kết sự việc trước khi kêu gọi follow
  assert.ok(res.scriptData.scenes[3].text.includes('cơ quan chức năng tiếp tục điều tra làm rõ'));
});

test('verifyAndFactCheckScript từ chối và cảnh báo khi phát hiện tin giả độc hại', async () => {
  const fakeArticle = {
    title: 'Thông tin thất thiệt bịa đặt',
    domain: 'fake-news.xyz',
    content: 'Nội dung xuyên tạc hoàn toàn...',
  };

  const fakeScript = {
    scenes: [{ id: 1, text: 'Nội dung sai sự thật...' }],
  };

  // Mock AI phát hiện fake news
  const mockAi = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          isFakeNews: true,
          verdict: 'FLAGGED_FAKE',
          issues: ['Tin giả bôi nhọ bịa đặt'],
        }),
      }),
    },
  };

  await assert.rejects(
    async () => {
      await verifyAndFactCheckScript({
        articleData: fakeArticle,
        scriptData: fakeScript,
        aiInstance: mockAi,
      });
    },
    (err) => err.message.includes('CẢNH BÁO BÁO CHÍ: Nội dung bài viết có dấu hiệu tin giả')
  );
});
