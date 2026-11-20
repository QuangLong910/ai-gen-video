# Template Spec Rules: news/honghot-social

Template tin tức mạng xã hội chuẩn kênh Hóng Hớt 24/7 & Tâm Điểm Túc Cầu — Phiên bản Mobile-First High-Retention (Tối ưu giữ chân người xem TikTok, Reels, Shorts).

---

## 1. Tổng quan & Triết lý thiết kế mới

Phong cách video tin tức mạng xã hội ngắn (9:16) hiện đại, tối ưu 100% trải nghiệm xem trên điện thoại di động:
- **Nguyên tắc nguồn tin thuần nhất (Single-Source Purity)**:
  * Mỗi video chỉ trích dẫn DUY NHẤT 1 BÀI BÁO / NGUỒN BÁO CHÍNH (ví dụ: `THEO: VNEXPRESS`), giữ cố định xuyên suốt từ cảnh Hook đến cảnh kết thúc.
  * Tuyệt đối không lấy nội dung, số liệu hay ảnh từ báo khác ghép sang.
- **Quy tắc nghiêm ngặt: Tuyệt đối KHÔNG DÙNG ẢNH AI GEN cho tin Pháp Luật / Tòa Án / Bắt Bớ / Nhân Vật Thật**:
  * Đối với các đại án, phiên tòa, lệnh bắt, bị can/bị cáo là nhân vật có thật: TUYỆT ĐỐI KHÔNG dùng AI để sinh ảnh vẽ mặt, vẽ phiên tòa, vẽ cảnh còng tay (dễ gây sai lệch nhân thân, sai trang phục tư pháp, vi phạm đạo đức báo chí).
  * BẮT BUỘC dùng ảnh báo chí chính thống chụp thật được các báo lớn đăng tải (VnExpress, Dân Trí, Tuổi Trẻ, CAND...), ảnh tư liệu thực tế, hoặc đồ họa typography/infographics trích dẫn lời khai, số liệu vụ án.
- **Bố cục 3 Tầng tách biệt (Tối ưu màn hình điện thoại)**:
  1. **Tầng 1 (1/3 trên cùng - Hook Headline đè lên ảnh)**:
     - Tiêu đề ngắn gọn, đắt giá, giật gân, **đè trực tiếp lên ảnh**.
     - Cỡ chữ cực đại: **70 - 90px**, font nét đậm (Black / ExtraBold).
     - **Chỉ 1 dòng duy nhất** (ví dụ: *"MU GỠ 4-4 PHÚT 90+6!"*, *"CEO NVIDIA THỪA NHẬN NGOẠI TÌNH!"*).
     - Màu vàng chanh viền đen dày (`#FACC15`, stroke đen 3px) hoặc màu trắng viền đen, đứng xa 30cm trên điện thoại vẫn đập ngay vào mắt.
     - Nằm ở vùng an toàn (Safe Zone): Cách mép trên 120 - 180px, không bị avatar kênh hay thanh trạng thái che.
  2. **Tầng 2 (Giữa màn hình - Ảnh lớn + Dynamic Subtitles)**:
     - Ảnh phóng to chiếm trọn 70 - 75% chiều cao khung hình (từ top đến đáy banner).
     - **Pacing đổi ảnh nhanh (2.5s - 3s / ảnh)**: Tuyệt đối KHÔNG giữ 1 ảnh tĩnh 7-9 giây khiến người xem buồn ngủ. Mỗi 2.5 - 3 giây phải chuyển 1 ảnh mới hoặc đổi góc zoom Ken Burns tập trung vào gương mặt/chủ thể.
     - **Phụ đề TTS động (Dynamic Subtitles)**: Chạy từng cụm từ ngắn nổi bật giữa màn hình theo nhịp giọng đọc để người xem tắt tiếng vẫn theo dõi trọn vẹn.
  3. **Tầng 3 (1/4 - 1/3 đáy màn hình - Banner nhận diện thu gọn)**:
     - Banner thu nhỏ thanh thoát ở đáy (cao khoảng 280 - 340px thay vì chiếm nửa màn hình).
     - **TUYỆT ĐỐI KHÔNG NHÉT TIÊU ĐỀ DÀI VÀO BANNER NỮA**.
     - Bên trái: Logo tròn thương hiệu (HÓNG HỚT 24/7 hoặc TÂM ĐIỂM TÚC CẦU).
     - Ở giữa: Tên kênh nhỏ + Ngày đăng (ví dụ: `HÓNG HỚT 24/7 • 09/11/2026`).
     - Bên phải: Nút hoặc tag `Follow` / `Đăng ký`.
     - Không để chữ dài quá 5-7 chữ trong banner.

---

## 2. Quy tắc nhịp điệu & Chuyển động (Pacing & Motion)

- **3 Giây đầu tiên (Hook giật gân stop-the-scroll)**:
  * Lời bình voiceover câu đầu tiên bắt buộc phải có từ ngữ cuốn hút, tự nhiên: *"Tin nóng!"*, *"Tin nóng nhất hôm nay!"*, *"Tin cực nóng!"*, *"Biến động mới nhất!"*... (TUYỆT ĐỐI KHÔNG lạm dụng từ "khẩn cấp").
  * Hình ảnh giây 0-2 có thể có badge nhấp nháy hoặc hiệu ứng zoom giật nhẹ.
- **Pacing hình ảnh**:
  * Mỗi video 30 - 35 giây cần chuẩn bị từ **6 đến 10 ảnh** (trung bình 2.5 - 3s/ảnh).
  * Hiệu ứng chuyển cảnh mượt mà kết hợp âm thanh whoosh nhẹ nhàng.
- **Âm thanh**:
  * Giọng đọc chuẩn thời sự (`Charon`).
  * Phát âm chuẩn: "Hóng Hớt hai tư trên bảy" (không đọc "hai tư gạch bảy").
  * Nhạc nền tin tức dồn dập, volume ~0.088, tuyệt đối KHÔNG có tiếng xé giấy (paper rip).

---

## 3. Quy chuẩn Caption & Hashtag khi đăng tải

- Viết caption giật gân, khơi gợi tương tác mạnh mẽ.
- **Quy tắc Hashtag**: CHỈ DÙNG TỐI ĐA 5 HASHTAG (chọn 5 thẻ đắt giá nhất, không spam).
