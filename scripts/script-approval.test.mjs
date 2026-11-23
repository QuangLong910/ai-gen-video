import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatScriptForTelegram,
  parseApprovalInput,
  createApprovalSession,
  clearActiveApproval,
  getActiveApproval,
} from './script-approval.mjs';

test('formatScriptForTelegram hiển thị đầy đủ 4 cảnh và hướng dẫn chờ duyệt 5 phút', () => {
  const articleData = {
    title: 'Quốc hội đồng ý áp thuế 0,2% với đất bỏ hoang',
    domain: 'vietnamnet.vn',
  };

  const scriptData = {
    scenes: [
      { id: 1, title: 'HOÀN TOÀN ĐỒNG Ý', text: 'Tin nóng! Quốc hội vừa đồng ý áp thuế đất bỏ hoang.' },
      { id: 2, title: 'MỤC TIÊU', text: 'Nhằm tránh đầu cơ lãng phí đất đai.' },
      { id: 3, title: 'HIỆU LỰC', text: 'Chính sách sẽ chính thức áp dụng từ ngày 1/7/2027.' },
      { id: 4, title: 'KẾT LUẬN', text: 'Hãy theo dõi Hóng Hớt hai tư trên bảy nhé!' },
    ],
  };

  const formatted = formatScriptForTelegram(articleData, scriptData, false);
  assert.ok(formatted.includes('KỊCH BẢN VIDEO DỰ KIẾN'));
  assert.ok(formatted.includes('CẢNH 1 - HOÀN TOÀN ĐỒNG Ý'));
  assert.ok(formatted.includes('Tin nóng! Quốc hội vừa đồng ý áp thuế đất bỏ hoang.'));
  assert.ok(formatted.includes('CẢNH 3 - HIỆU LỰC'));
  assert.ok(formatted.includes('5 PHÚT'));
  assert.ok(formatted.includes('ok'));
});

test('parseApprovalInput phân loại chính xác duyệt, hủy, hoặc yêu cầu sửa kịch bản', () => {
  // 1. Duyệt ngay
  assert.equal(parseApprovalInput('ok').action, 'APPROVE');
  assert.equal(parseApprovalInput('Duyệt').action, 'APPROVE');
  assert.equal(parseApprovalInput('tiếp tục').action, 'APPROVE');
  assert.equal(parseApprovalInput('chốt').action, 'APPROVE');

  // 2. Hủy
  assert.equal(parseApprovalInput('hủy').action, 'CANCEL');
  assert.equal(parseApprovalInput('Cancel').action, 'CANCEL');
  assert.equal(parseApprovalInput('thôi').action, 'CANCEL');

  // 3. Yêu cầu sửa kịch bản
  const edit1 = parseApprovalInput('sửa cảnh 2 thành hạn chế đầu cơ');
  assert.equal(edit1.action, 'EDIT_REQUEST');
  assert.equal(edit1.feedback, 'sửa cảnh 2 thành hạn chế đầu cơ');

  const edit2 = parseApprovalInput('thiếu mốc thời gian 1/7/2027 kìa bạn');
  assert.equal(edit2.action, 'EDIT_REQUEST');
  assert.ok(edit2.feedback.includes('1/7/2027'));
});

test('createApprovalSession tự động duyệt khi hết thời gian chờ', async () => {
  clearActiveApproval();

  let timedOut = false;
  let resolvedStatus = '';

  createApprovalSession({
    slug: 'test-slug',
    scriptData: { scenes: [] },
    articleData: { title: 'Test' },
    replyMessageId: 123,
    timeoutMs: 50, // 50ms cho test nhanh
    onTimeout: async () => {
      timedOut = true;
    },
    onResolve: (res) => {
      resolvedStatus = res.status;
    },
  });

  assert.ok(getActiveApproval() !== null);

  // Chờ timeout 50ms
  await new Promise((r) => setTimeout(r, 80));

  assert.equal(timedOut, true);
  assert.equal(resolvedStatus, 'TIMEOUT_AUTO_APPROVED');
  assert.equal(getActiveApproval(), null);
});
