/**
 * scripts/script-approval.mjs
 *
 * QUY TRÌNH DUYỆT KỊCH BẢN CHỜ PHẢN HỒI 5 PHÚT (SCRIPT APPROVAL GATEWAY)
 *
 * Cơ chế:
 * 1. Viết xong kịch bản -> Gửi ngay toàn văn kịch bản chi tiết lên Telegram cho chủ kênh duyệt.
 * 2. Đặt bộ đếm thời gian 5 phút:
 *    - Nếu chủ kênh phản hồi góp ý / báo lỗi: AI tự động sửa kịch bản theo đúng yêu cầu và gửi lại.
 *    - Nếu chủ kênh nhắn "ok", "duyệt", "tiếp tục": Bỏ qua đếm ngược và tiến hành render ngay.
 *    - Nếu chủ kênh nhắn "hủy": Dừng pipeline.
 *    - Nếu sau 5 phút chủ kênh KHÔNG phản hồi: Tự động coi như đã duyệt và tiến hành render video tự động!
 */

export function formatScriptForTelegram(articleData, scriptData, isUpdated = false) {
  const scenesHtml = (scriptData.scenes || [])
    .map(
      (s) =>
        `🎬 <b>CẢNH ${s.id}${s.title ? ` - ${s.title}` : ''}:</b>\n🗣 <i>"${s.text}"</i>`
    )
    .join('\n\n');

  const header = isUpdated
    ? `✨ <b>KỊCH BẢN ĐÃ ĐƯỢC CHỈNH SỬA THEO GÓP Ý CỦA BẠN:</b>`
    : `📝 <b>KỊCH BẢN VIDEO DỰ KIẾN (CHỜ BẠN DUYỆT):</b>`;

  const footer =
    `⏳ <b>Thời gian chờ bạn duyệt: 5 PHÚT</b>\n` +
    `👉 <b>Để sửa:</b> Hãy nhắn trực tiếp nội dung cần sửa (ví dụ: <i>"sửa cảnh 2 thành...", "bỏ từ...", "thêm mốc 1/7/2027"</i>).\n` +
    `👉 <b>Để duyệt ngay:</b> Nhắn <code>ok</code> hoặc <code>duyệt</code> để kết xuất video ngay lập tức.\n` +
    `👉 <i>Nếu sau 5 phút bạn không phản hồi, hệ thống sẽ tự động coi như bạn đã duyệt và bắt đầu làm video!</i>`;

  const title = articleData.title || 'Bản tin Hóng Hớt 24/7';
  const domain = articleData.domain || 'Báo chí';

  return `${header}\n\n📰 <b>Tiêu đề:</b> ${title}\n📌 <b>Nguồn:</b> ${domain}\n\n${scenesHtml}\n\n${footer}`;
}

let activeApproval = null;

export function getActiveApproval() {
  return activeApproval;
}

export function clearActiveApproval() {
  if (activeApproval && activeApproval.timer) {
    clearTimeout(activeApproval.timer);
  }
  activeApproval = null;
}

/**
 * Khởi tạo phiên chờ duyệt kịch bản 5 phút
 */
export function createApprovalSession({
  slug,
  scriptData,
  articleData,
  replyMessageId,
  timeoutMs = 300000, // 5 phút mặc định
  onTimeout,
  onResolve,
}) {
  clearActiveApproval();

  const session = {
    slug,
    scriptData,
    articleData,
    replyMessageId,
    createdAt: Date.now(),
    timeoutMs,
    timer: null,
    resolve: onResolve,
  };

  session.timer = setTimeout(async () => {
    console.log(`[ScriptApproval] Hết ${Math.round(timeoutMs / 60000)} phút chờ duyệt. Tự động duyệt kịch bản cho slug: ${slug}`);
    if (activeApproval === session) {
      activeApproval = null;
      if (onTimeout) {
        await onTimeout(session);
      }
      if (onResolve) {
        onResolve({ status: 'TIMEOUT_AUTO_APPROVED', scriptData: session.scriptData });
      }
    }
  }, timeoutMs);

  activeApproval = session;
  return session;
}

/**
 * Xử lý tin nhắn của người dùng trong khi đang có phiên chờ duyệt
 */
export function parseApprovalInput(text) {
  const lower = (text || '').trim().toLowerCase();

  // Nhóm lệnh duyệt ngay
  const approveKeywords = [
    'ok',
    'oke',
    'okey',
    'okay',
    'duyệt',
    'duyet',
    'tiếp tục',
    'tiep tuc',
    'chạy đi',
    'chay di',
    'render',
    'làm đi',
    'lam di',
    'đồng ý',
    'dong y',
    'chốt',
    'chot',
  ];

  if (approveKeywords.includes(lower)) {
    return { action: 'APPROVE' };
  }

  // Nhóm lệnh hủy
  const cancelKeywords = ['hủy', 'huy', 'cancel', 'dừng', 'dung', 'bỏ qua', 'bo qua', 'thôi', 'thoi'];
  if (cancelKeywords.includes(lower)) {
    return { action: 'CANCEL' };
  }

  // Nếu người dùng nhắn bất kỳ câu chữ nào khác -> Yêu cầu sửa kịch bản
  return {
    action: 'EDIT_REQUEST',
    feedback: text.trim(),
  };
}
