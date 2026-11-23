import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBotMemory,
  saveBotMemory,
  updateLastJob,
  addCustomDirective,
  removeCustomDirective,
  fallbackAnalyzeMessage,
} from './tele-bot-brain.mjs';

test('loadBotMemory khởi tạo đầy đủ lastJob và các quy tắc mặc định', () => {
  const memory = loadBotMemory();
  assert.ok(Array.isArray(memory.customDirectives));
  assert.ok(memory.customDirectives.length >= 1);
  if (memory.lastJob) {
    assert.ok(typeof memory.lastJob.articleTitle === 'string');
    assert.ok(typeof memory.lastJob.urlOrText === 'string');
  }
});

test('addCustomDirective thêm quy tắc mới và chống trùng lặp', () => {
  const rule = 'Test rule ' + Date.now();
  const added = addCustomDirective(rule);
  assert.equal(added, true);

  // Thêm lại cùng quy tắc phải trả về false
  const addedAgain = addCustomDirective(rule);
  assert.equal(addedAgain, false);

  const memory = loadBotMemory();
  assert.ok(memory.customDirectives.includes(rule));

  // Dọn dẹp quy tắc vừa thêm
  const idx = memory.customDirectives.indexOf(rule);
  if (idx >= 0) {
    removeCustomDirective(idx + 1);
  }
});

test('fallbackAnalyzeMessage phân tích chuẩn xác phản hồi/báo lỗi của người dùng', () => {
  const mockLastJob = {
    articleTitle: 'Quốc hội đồng ý áp thuế 0,2% với đất bỏ hoang',
    urlOrText: 'https://vietnamnet.vn/quoc-hoi-dong-y-ap-thue-0-2-voi-dat-bo-hoang-2577107.html',
    targetDuration: 38,
  };

  // Case 1: Báo lỗi thiếu mốc thời gian
  const res1 = fallbackAnalyzeMessage('video vừa rồi thiếu mốc 1/7/2027, sửa lại giúp tôi', mockLastJob);
  assert.equal(res1.intent, 'REMAKE_WITH_FEEDBACK');
  assert.ok(res1.feedback.includes('thiếu mốc 1/7/2027'));
  assert.ok(res1.replyText.includes('Đang sửa lại kịch bản'));

  // Case 2: Báo lỗi nói quá / phóng đại
  const res2 = fallbackAnalyzeMessage('nói quá rồi, bài báo chỉ nói trời rét sao bảo rét đậm rét hại', mockLastJob);
  assert.equal(res2.intent, 'REMAKE_WITH_FEEDBACK');

  // Case 3: Yêu cầu đổi thời lượng
  const res3 = fallbackAnalyzeMessage('sửa lại 30s thôi', mockLastJob);
  assert.equal(res3.intent, 'REMAKE_WITH_FEEDBACK');
  assert.equal(res3.targetDuration, 30);

  // Case 4: Yêu cầu đổi ảnh
  const res4 = fallbackAnalyzeMessage('ảnh này xấu quá, đổi ảnh khác đi', mockLastJob);
  assert.equal(res4.intent, 'REMAKE_WITH_FEEDBACK');
  assert.equal(res4.refreshImages, true);

  // Case 5: Dặn dò quy tắc lâu dài
  const res5 = fallbackAnalyzeMessage('từ nay về sau tin chính sách nhớ thêm mốc thời gian nhé', mockLastJob);
  assert.equal(res5.intent, 'SAVE_DIRECTIVE');
  assert.ok(res5.directive.includes('thêm mốc thời gian'));

  // Case 6: Quét tin mới
  const res6 = fallbackAnalyzeMessage('có tin gì mới ko', mockLastJob);
  assert.equal(res6.intent, 'TREND_QUERY');

  // Case 7: Hỏi thăm / trò chuyện
  const res7 = fallbackAnalyzeMessage('hôm nay bạn khỏe không', null);
  assert.equal(res7.intent, 'CHAT_OR_QUESTION');
});
