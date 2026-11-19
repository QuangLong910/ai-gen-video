/**
 * Generic News Video Data Schema
 * File: public/<slug>/video-data.json
 * 
 * Được tạo tự động bởi scripts/auto-gen.mjs từ AI (Gemini)
 * Template Remotion đọc file này để render video
 */
export interface VideoData {
  slug: string;
  channelName: string;      // Tên kênh hiển thị trên header badge
  source: string;           // "NGUỒN: VIETNAMNET" etc.
  accentColor: string;      // Màu chủ đạo "#E11D48"
  accentColor2: string;     // Màu phụ "#FBBF24"
  
  // Scene 1 - Hook (Banner pop-up)
  hook: {
    headline: string;       // Tiêu đề lớn, in hoa
    subline: string;        // Mô tả ngắn màu vàng
    categoryLabel: string;  // "TIN NÓNG" / "BREAKING" etc.
    image: string;          // filename trong evidence/ folder
  };

  // Scene 2-5 - Body scenes (ảnh full-screen + info card)
  scenes: Array<{
    image: string;          // filename trong evidence/
    badgeLabel: string;     // Label nhỏ trên card
    badgeColor: string;     // Màu badge "#E11D48"
    title: string;          // Tiêu đề lớn của card
    items: Array<{          // Danh sách items (tên/text)
      text: string;
      sub?: string;         // Sub-text nhỏ bên dưới (optional)
      highlight?: boolean;  // Nổi bật với border vàng
    }>;
  }>;

  // Scene cuối - CTA
  ending: {
    question: string;       // Câu hỏi poll
    option1: string;        // Option 1 (màu xanh)
    option2: string;        // Option 2 (màu đỏ)
  };
}
