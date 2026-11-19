import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';
import {COLORS} from './tokens';

interface Scene5OutroProps {
  slug: string;
}

export const Scene5Outro: React.FC<Scene5OutroProps> = ({slug}) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 734], [1.08, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ctaSlide = interpolate(frame, [30, 50], [60, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* Background Wide Shot */}
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <img
          src={staticFile(
            `${slug}/evidence/cristiano_ronaldo_and_lionel_messi_-_portugal_vs_argentina,_9th_february_2011.jpg`,
          )}
          alt="Messi and Ronaldo Legacy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 35%',
            transform: `scale(${scale})`,
            filter: 'brightness(0.75)',
          }}
        />
        {/* Cinematic dark vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(5,7,13,0.7) 0%, rgba(5,7,13,0.3) 50%, rgba(5,7,13,0.95) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* Center Call To Action Card */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: `translate(-50%, -50%) translateY(${ctaSlide}px)`,
          opacity: ctaOpacity,
          background: 'rgba(9, 13, 22, 0.94)',
          backdropFilter: 'blur(20px)',
          border: `2px solid ${COLORS.accentGold}`,
          borderRadius: 20,
          padding: '36px 54px',
          textAlign: 'center',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          zIndex: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <img
          src={staticFile('watermark_k2.png')}
          alt="Logo K2"
          style={{
            height: 72,
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(250, 204, 21, 0.4))',
          }}
        />

        <div
          style={{
            color: '#FFFFFF',
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontFamily: 'sans-serif',
          }}
        >
          CẢM ƠN HAI HUYỀN THOẠI VĨ ĐẠI
        </div>

        <div
          style={{
            color: COLORS.accentGold,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.5px',
            fontFamily: 'sans-serif',
          }}
        >
          BẤM LIKE & ĐĂNG KÝ KÊNH ĐỂ THEO DÕI CÁC BẢN TIN TIẾP THEO
        </div>

        <div
          style={{
            background: COLORS.primaryRed,
            color: '#FFFFFF',
            fontSize: 18,
            fontWeight: 900,
            padding: '10px 32px',
            borderRadius: 30,
            letterSpacing: '1px',
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.6)',
          }}
        >
          SUBSCRIBE • TÂM ĐIỂM TÚC CẦU
        </div>
      </div>

      {/* Broadcast Lower Third */}
      <BroadcastLowerThird
        category="TRI ÂN NGƯỜI HÂM MỘ"
        headline="DI SẢN BẤT TỬ CỦA THỜI ĐẠI HOÀNG KIM"
        subline="Đừng quên like và đăng ký kênh Tâm Điểm Túc Cầu để cập nhật tin nóng mỗi ngày"
        source="TÂM ĐIỂM TÚC CẦU"
      />
    </AbsoluteFill>
  );
};
