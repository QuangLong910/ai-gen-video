import React from 'react';
import {staticFile, useCurrentFrame, interpolate} from 'remotion';
import {COLORS} from './tokens';

interface BroadcastLowerThirdProps {
  category?: string;
  headline: string;
  subline: string;
  source?: string;
}

export const BroadcastLowerThird: React.FC<BroadcastLowerThirdProps> = ({
  category = 'TÂM ĐIỂM THỂ THAO',
  headline,
  subline,
  source = 'THEO: FABRIZIO ROMANO & BÁO CHÍ Ả RẬP',
}) => {
  const frame = useCurrentFrame();

  // Entrance animation
  const slideIn = interpolate(frame, [0, 15], [80, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <>
      {/* ── Top Header Bar (16:9 Landscape) ── */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 48,
          right: 48,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 40,
        }}
      >
        {/* Left: Watermark & Channel Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'rgba(9, 13, 22, 0.75)',
            backdropFilter: 'blur(12px)',
            padding: '8px 20px',
            borderRadius: 30,
            border: '1px solid rgba(250, 204, 21, 0.3)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src={staticFile('watermark_k2.png')}
            alt="Logo"
            style={{
              height: 44,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8))',
            }}
          />
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <span
              style={{
                color: COLORS.accentGold,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '1px',
                fontFamily: 'sans-serif',
              }}
            >
              TÂM ĐIỂM TÚC CẦU
            </span>
            <span
              style={{
                color: '#E2E8F0',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.5px',
                fontFamily: 'sans-serif',
              }}
            >
              CHUYÊN ĐỀ ĐẶC BIỆT
            </span>
          </div>
        </div>

        {/* Right: Live Tag & Source */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(9, 13, 22, 0.75)',
            backdropFilter: 'blur(12px)',
            padding: '8px 20px',
            borderRadius: 30,
            border: '1px solid rgba(220, 38, 38, 0.4)',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#EF4444',
              boxShadow: '0 0 10px #EF4444',
            }}
          />
          <span
            style={{
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '1px',
              fontFamily: 'sans-serif',
            }}
          >
            {source}
          </span>
        </div>
      </div>

      {/* ── Lower Third Graphics Bar (16:9 Broadcast Style) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 48,
          right: 48,
          transform: `translateY(${slideIn}px)`,
          opacity,
          zIndex: 35,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* Category Badge & Live Pulse */}
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <div
            style={{
              backgroundColor: COLORS.primaryRed,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 900,
              padding: '4px 16px',
              borderRadius: '4px 4px 0 0',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
            }}
          >
            {category}
          </div>
        </div>

        {/* Main Lower-Third Plate */}
        <div
          style={{
            background:
              'linear-gradient(90deg, rgba(15, 23, 42, 0.94) 0%, rgba(15, 23, 42, 0.88) 70%, rgba(15, 23, 42, 0.5) 100%)',
            backdropFilter: 'blur(16px)',
            borderLeft: `8px solid ${COLORS.accentGold}`,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '14px 28px',
            borderRadius: '0 12px 12px 0',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: '#FFFFFF',
              letterSpacing: '0.5px',
              fontFamily: 'sans-serif',
              textTransform: 'uppercase',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: COLORS.accentGold,
              letterSpacing: '0.2px',
              fontFamily: 'sans-serif',
            }}
          >
            {subline}
          </div>
        </div>
      </div>
    </>
  );
};
