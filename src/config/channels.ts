/**
 * src/config/channels.ts
 * 
 * Cấu hình hệ thống đa kênh (Multi-Channel Branding)
 * Hỗ trợ phân luồng render video độc lập cho từng kênh:
 * - Kênh 1: HÓNG HỚT 24/7 (Tin tức, drama, thời sự)
 * - Kênh 2: Kênh tùy chỉnh (Tên, logo, banner, màu sắc, giọng đọc riêng)
 */

export interface ChannelConfig {
  id: string;
  name: string;
  watermark: string; // Tên file trong public/ (ví dụ: watermark.png, watermark_k2.png)
  banner: string;    // Tên file banner trong public/ (ví dụ: banner.png, banner_k2.png)
  primaryColor: string; // Màu chủ đạo của kênh (Hex)
  accentColor: string;  // Màu nhấn
  voice: {
    geminiVoice: string; // 'Charon' (Nam), 'Aoede' (Nữ), 'Puck', 'Fenrir', v.v.
    elevenLabsVoiceId?: string;
  };
  defaultBgMusic?: string;
  tagline: string;
}

export const CHANNELS: Record<string, ChannelConfig> = {
  k1: {
    id: 'k1',
    name: 'HÓNG HỚT 24/7',
    watermark: 'watermark.png',
    banner: 'banner.png',
    primaryColor: '#E11D48', // Đỏ Ruby thời sự
    accentColor: '#FACC15',  // Vàng Gold
    voice: {
      geminiVoice: 'Charon', // Nam chững chạc, uy quyền
      elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
    },
    defaultBgMusic: 'assets/news/music/the_mountain-news-news-music.mp3',
    tagline: 'TIN NÓNG 24H',
  },
  k2: {
    id: 'k2',
    name: 'Tâm Điểm Túc Cầu',
    watermark: 'watermark_k2.png',
    banner: 'banner_k2.png',
    primaryColor: '#DC2626', // Đỏ thể thao rực lửa
    accentColor: '#FACC15',  // Vàng nổi bật
    voice: {
      geminiVoice: 'Puck',   // Giọng Nam hào sảng, sôi động, chuẩn bình luận thể thao
      elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB', // Giọng Nam mạnh mẽ
    },
    defaultBgMusic: 'assets/news/music/sonican-flash-news.mp3',
    tagline: 'TIN TỨC • BÌNH LUẬN • CẬP NHẬT NHANH NHẤT',
  },
};

/**
 * Lấy cấu hình kênh theo id ('k1' hoặc 'k2').
 * Mặc định trả về k1 nếu không tìm thấy.
 */
export function getChannel(channelId?: string): ChannelConfig {
  if (!channelId) return CHANNELS.k1;
  const key = channelId.toLowerCase().trim();
  return CHANNELS[key] || CHANNELS.k1;
}
