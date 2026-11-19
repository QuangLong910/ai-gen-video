import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {loadFont} from '@remotion/google-fonts/BeVietnamPro';

const {fontFamily} = loadFont('normal', {
  weights: ['700', '900'],
  subsets: ['latin', 'vietnamese'],
});

export const Thumbnail: React.FC<{
  slug: string;
  title?: string;
  subtitle?: string;
  source?: string;
  date?: string;
}> = ({
  slug,
  title = 'CHÍNH THỨC: MU SA THẢI HLV CARRICK!',
  subtitle = 'GHẾ NÓNG BỎ TRỐNG, ĐÀM PHÁN ĐƯA POCHETTINO VỀ',
  source = 'THEO: THỂ THAO 247',
  date = '13/11/2026',
}) => {
  return (
    <AbsoluteFill style={{backgroundColor: '#0A0E1A', fontFamily, overflow: 'hidden'}}>
      {/* ── NỬA TRÊN (0 - 1040px): ẢNH THỰC TẾ SẮC NÉT FULL KHÔNG MỜ ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1040,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <img
          src={staticFile(`${slug}/evidence/sharp_1.jpg`)}
          alt="Carrick chia tay MU"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {/* Soft shadow edge */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.9) 100%)',
          }}
        />

        {/* Top Header Tag */}
        <div
          style={{
            position: 'absolute',
            top: 50,
            left: 48,
            right: 48,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 30,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              border: '2px solid rgba(255,255,255,0.25)',
              borderRadius: 30,
              padding: '10px 24px',
              fontSize: 26,
              fontWeight: 800,
              color: '#F8FAFC',
              letterSpacing: 1,
            }}
          >
            {source}
          </div>
          <div
            style={{
              backgroundColor: 'rgba(220,38,38,0.9)',
              borderRadius: 30,
              padding: '10px 24px',
              fontSize: 26,
              fontWeight: 800,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>HÓNG HỚT 24/7</span>
          </div>
        </div>
      </div>

      {/* ── NỬA DƯỚI (1040px - 1920px): BANNER THƯƠNG HIỆU 50% ── */}
      <AbsoluteFill
        style={{
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <img
          src={staticFile('assets/news/banner.png')}
          alt="Hóng Hớt 24/7 Banner"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: 'translateY(0px)',
          }}
        />

        {/* Cụm Tiêu Đề Nổi Bật Nằm Giữa Banner Đỏ */}
        <div
          style={{
            position: 'absolute',
            top: 1060,
            bottom: 80,
            left: 48,
            right: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            zIndex: 40,
            gap: 18,
          }}
        >
          <div
            style={{
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              padding: '8px 26px',
              borderRadius: 8,
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              boxShadow: '0 6px 20px rgba(220, 38, 38, 0.7)',
            }}
          >
            🔥 BIẾN CĂNG OLD TRAFFORD
          </div>

          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: '#FACC15',
              lineHeight: 1.2,
              textTransform: 'uppercase',
              textShadow:
                '0 0 15px #000, 4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 0 8px 30px rgba(0,0,0,0.95)',
              letterSpacing: '-0.5px',
              maxWidth: 980,
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.3,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              padding: '12px 28px',
              borderRadius: 16,
              border: '1.5px solid rgba(250, 204, 21, 0.4)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
              maxWidth: 940,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 48,
            right: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: '#FFE57A',
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            HÓNG HỚT 24/7 • {date}
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
