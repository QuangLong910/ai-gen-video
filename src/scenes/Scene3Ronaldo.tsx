import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';
import {COLORS} from './tokens';

interface Scene3RonaldoProps {
  slug: string;
}

export const Scene3Ronaldo: React.FC<Scene3RonaldoProps> = ({slug}) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 915], [1.0, 1.1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardSlide = interpolate(frame, [15, 35], [-100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* Background: Ronaldo in Al Nassr Yellow */}
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <img
          src={staticFile(`${slug}/evidence/ronaldo_alnassr.jpg`)}
          alt="Cristiano Ronaldo Al Nassr"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '65% 20%',
            transform: `scale(${scale})`,
            transformOrigin: '65% 20%',
          }}
        />
        {/* Dark gradient on the left side to host stat cards */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(5,7,13,0.95) 0%, rgba(5,7,13,0.85) 28%, rgba(5,7,13,0.2) 60%, rgba(5,7,13,0.4) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* Floating Info / Stat Box on Left (16:9 Landscape) */}
      <div
        style={{
          position: 'absolute',
          top: 130,
          left: 56,
          width: 440,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transform: `translateX(${cardSlide}px)`,
          opacity: cardOpacity,
          zIndex: 30,
        }}
      >
        <div
          style={{
            background: 'rgba(250, 204, 21, 0.2)',
            border: '2px solid #FACC15',
            padding: '8px 18px',
            borderRadius: 8,
            color: '#FACC15',
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            alignSelf: 'flex-start',
            boxShadow: '0 4px 16px rgba(250, 204, 21, 0.3)',
          }}
        >
          AL NASSR FC • LỘ TRÌNH GIẢI NGHỆ
        </div>

        {/* Fact Cards */}
        {[
          {label: 'MÙA GIẢI CUỐI CÙNG', value: '2026 - 2027', note: 'Chính thức treo giày vào mùa hè 2027'},
          {label: 'TUỔI TÁC LỊCH SỬ', value: '42 TUỔI', note: 'Sau 5 mùa giải cống hiến trọn vẹn'},
          {label: 'ĐÃI NGỘ KỶ LỤC', value: '250 TRIỆU USD / MÙA', note: 'Al Nassr lên kế hoạch trận vinh danh toàn cầu'},
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(16px)',
              borderLeft: '5px solid #FACC15',
              borderRadius: 10,
              padding: '14px 20px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                color: '#94A3B8',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '1px',
                marginBottom: 4,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                color: '#FFFFFF',
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: '0.5px',
                marginBottom: 2,
              }}
            >
              {item.value}
            </div>
            <div style={{color: '#38BDF8', fontSize: 13, fontWeight: 600}}>
              {item.note}
            </div>
          </div>
        ))}
      </div>

      {/* Broadcast Lower Third */}
      <BroadcastLowerThird
        category="CHẤN ĐỘNG TRUNG ĐÔNG"
        headline="RONALDO THÔNG BÁO GIẢI NGHỆ: MÙA GIẢI CUỐI CÙNG TẠI AL NASSR"
        subline="365Scores Arabic xác nhận: CR7 sẽ chính thức treo giày vào hè 2027 ở tuổi 42"
        source="THEO: 365SCORES ARABIC"
      />
    </AbsoluteFill>
  );
};
