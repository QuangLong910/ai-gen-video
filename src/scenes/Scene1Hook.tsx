import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';

interface Scene1HookProps {
  slug: string;
}

export const Scene1Hook: React.FC<Scene1HookProps> = ({slug}) => {
  const frame = useCurrentFrame();

  // Slow cinematic pan/zoom
  const scale = interpolate(frame, [0, 600], [1.02, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* Background High-Res Image - Widescreen 16:9 Cover */}
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <img
          src={staticFile(
            `${slug}/evidence/cristiano_ronaldo_and_lionel_messi_-_portugal_vs_argentina,_9th_february_2011.jpg`,
          )}
          alt="Messi & Ronaldo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 25%',
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
        {/* Subtle cinematic gradient vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(5,7,13,0.5) 0%, rgba(5,7,13,0.1) 40%, rgba(5,7,13,0.85) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* Floating Center Badge during opening 120 frames */}
      <div
        style={{
          position: 'absolute',
          top: 130,
          left: 48,
          background: 'rgba(220, 38, 38, 0.9)',
          padding: '8px 24px',
          borderRadius: 8,
          color: '#FFFFFF',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
        }}
      >
        HOT NEWS • THÁNG 11/2026
      </div>

      {/* Broadcast Lower Third Graphics Bar */}
      <BroadcastLowerThird
        category="CHUYỂN NHƯỢNG & ĐOẠN KẾT"
        headline="ĐOẠN KẾT CỦA HAI HUYỀN THOẠI: MESSI & RONALDO ĐI VỀ ĐÂU?"
        subline="Tiết lộ độc quyền: Lộ trình tương lai của hai tượng đài vĩ đại nhất thế giới"
        source="THEO: FABRIZIO ROMANO & 365SCORES"
      />
    </AbsoluteFill>
  );
};
