import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';
import {COLORS} from './tokens';

interface Scene2MessiProps {
  slug: string;
}

export const Scene2Messi: React.FC<Scene2MessiProps> = ({slug}) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 1080], [1.0, 1.1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardSlide = interpolate(frame, [15, 35], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* Background: Messi in Inter Miami Pink */}
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <img
          src={staticFile(
            `${slug}/evidence/lionel_messi_ne_revolution_inter_miami_7.9.25-203.jpg`,
          )}
          alt="Lionel Messi Inter Miami"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '35% 20%',
            transform: `scale(${scale})`,
            transformOrigin: '35% 20%',
          }}
        />
        {/* Dark gradient on the right side to host stat cards */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(5,7,13,0.3) 0%, rgba(5,7,13,0.2) 40%, rgba(5,7,13,0.85) 75%, rgba(5,7,13,0.95) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* Floating Info / Stat Box on Right (16:9 Landscape advantage) */}
      <div
        style={{
          position: 'absolute',
          top: 130,
          right: 56,
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
            background: 'rgba(236, 72, 153, 0.2)',
            border: '2px solid #EC4899',
            padding: '8px 18px',
            borderRadius: 8,
            color: '#F472B6',
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            alignSelf: 'flex-start',
            boxShadow: '0 4px 16px rgba(236, 72, 153, 0.3)',
          }}
        >
          INTER MIAMI CF • CAM KẾT TRỌN ĐỜI
        </div>

        {/* Fact Cards */}
        {[
          {label: 'THỜI HẠN HỢP ĐỒNG', value: 'ĐẾN THÁNG 12/2028', note: 'Khi Messi bước sang tuổi 41'},
          {label: 'MỤC TIÊU LỊCH SỬ', value: 'CÁN MỐC 950 BÀN THẮNG', note: 'Và bảo vệ chức vô địch MLS Cup'},
          {label: 'TRI KỶ TÁI HỢP', value: 'LUIS SUAREZ & DE PAUL', note: 'Gia hạn đến 2028, gia đình hạnh phúc'},
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(16px)',
              borderLeft: '5px solid #F472B6',
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
            <div style={{color: COLORS.accentGold, fontSize: 13, fontWeight: 600}}>
              {item.note}
            </div>
          </div>
        ))}
      </div>

      {/* Broadcast Lower Third */}
      <BroadcastLowerThird
        category="TƯƠNG LAI MESSI"
        headline="MESSI DẬP TẮT TIN ĐỒN: GẮN BÓ TRỌN ĐỜI VỚI INTER MIAMI"
        subline="Fabrizio Romano xác nhận: El Pulga hạnh phúc tại Mỹ, gia hạn đến năm 2028"
        source="THEO: FABRIZIO ROMANO (DAZN)"
      />
    </AbsoluteFill>
  );
};
