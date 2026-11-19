import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';
import {COLORS} from './tokens';

interface Scene4ComparisonProps {
  slug: string;
}

export const Scene4Comparison: React.FC<Scene4ComparisonProps> = ({slug}) => {
  const frame = useCurrentFrame();

  const scaleLeft = interpolate(frame, [0, 921], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scaleRight = interpolate(frame, [0, 921], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const centerPop = interpolate(frame, [15, 30], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const centerOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* ── Split Screen Container (16:9 Landscape) ── */}
      <div style={{display: 'flex', width: '100%', height: '100%', position: 'relative'}}>
        {/* Left Side: Messi */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            borderRight: '2px solid rgba(250, 204, 21, 0.4)',
          }}
        >
          <img
            src={staticFile(
              `${slug}/evidence/lionel_messi_ne_revolution_inter_miami_7.9.25-178_(cropped_2).jpg`,
            )}
            alt="Lionel Messi"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 20%',
              transform: `scale(${scaleLeft})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(236, 72, 153, 0.2) 0%, rgba(5,7,13,0.3) 40%, rgba(5,7,13,0.85) 100%)',
            }}
          />
          {/* Label Messi */}
          <div
            style={{
              position: 'absolute',
              top: 130,
              left: 48,
              background: 'rgba(236, 72, 153, 0.9)',
              padding: '8px 22px',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '1px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            LIONEL MESSI • 8 QUẢ BÓNG VÀNG
          </div>
        </div>

        {/* Right Side: Ronaldo */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <img
            src={staticFile(`${slug}/evidence/ronaldo_alnassr.jpg`)}
            alt="Cristiano Ronaldo"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '50% 15%',
              transform: `scale(${scaleRight})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(250, 204, 21, 0.2) 0%, rgba(5,7,13,0.3) 40%, rgba(5,7,13,0.85) 100%)',
            }}
          />
          {/* Label Ronaldo */}
          <div
            style={{
              position: 'absolute',
              top: 130,
              right: 48,
              background: 'rgba(250, 204, 21, 0.95)',
              padding: '8px 22px',
              borderRadius: 8,
              color: '#0F172A',
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '1px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            CRISTIANO RONALDO • 5 QUẢ BÓNG VÀNG
          </div>
        </div>

        {/* Center Floating VS / Era Card */}
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${centerPop})`,
            opacity: centerOpacity,
            background: 'rgba(9, 13, 22, 0.92)',
            backdropFilter: 'blur(20px)',
            border: '2px solid rgba(250, 204, 21, 0.6)',
            borderRadius: 16,
            padding: '24px 36px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            zIndex: 32,
            minWidth: 420,
          }}
        >
          <div
            style={{
              color: COLORS.accentGold,
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: '2px',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            20 NĂM THỐNG TRỊ
          </div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 34,
              fontWeight: 900,
              marginBottom: 8,
              letterSpacing: '1px',
            }}
          >
            1.800+ BÀN THẮNG
          </div>
          <div
            style={{
              color: '#94A3B8',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}
          >
            13 QUẢ BÓNG VÀNG • KỶ NGUYÊN VÔ TIỀN KHOÁNG HẬU
          </div>
        </div>
      </div>

      {/* Broadcast Lower Third */}
      <BroadcastLowerThird
        category="HAI NGỌN NÚI LỊCH SỬ"
        headline="HAI TRIẾT LÝ ĐOẠN KẾT: BÌNH YÊN NƯỚC MỸ & NGỌN LỬA Ả RẬP"
        subline="Messi tìm kiếm niềm vui thuần khiết • Ronaldo quyết chạm mốc 1.000 bàn thắng"
        source="PHÂN TÍCH TÂM ĐIỂM TÚC CẦU"
      />
    </AbsoluteFill>
  );
};
