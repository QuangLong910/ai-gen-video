import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {BroadcastLowerThird} from './BroadcastLowerThird';

interface WidescreenSportsSceneProps {
  slug: string;
  image: string;
  category?: string;
  headline: string;
  subline: string;
  source?: string;
  panDirection?: 'zoom-in' | 'pan-left' | 'pan-right' | 'zoom-out';
}

export const WidescreenSportsScene: React.FC<WidescreenSportsSceneProps> = ({
  slug,
  image,
  category = 'TÂM ĐIỂM V-LEAGUE',
  headline,
  subline,
  source = 'THEO: BÁO DÂN TRÍ',
  panDirection = 'zoom-in',
}) => {
  const frame = useCurrentFrame();

  const scale = interpolate(
    frame,
    [0, 800],
    panDirection === 'zoom-out' ? [1.12, 1.02] : [1.02, 1.12],
    {extrapolateRight: 'clamp'}
  );

  const panX = interpolate(
    frame,
    [0, 800],
    panDirection === 'pan-left' ? [20, -20] : panDirection === 'pan-right' ? [-20, 20] : [0, 0],
    {extrapolateRight: 'clamp'}
  );

  return (
    <AbsoluteFill style={{backgroundColor: '#05070D', overflow: 'hidden'}}>
      {/* ── Background High-Res 16:9 Image ── */}
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <img
          src={staticFile(`${slug}/evidence/${image}`)}
          alt={headline}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translateX(${panX}px)`,
            transformOrigin: 'center center',
          }}
        />
        {/* Cinematic gradient vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(5,7,13,0.55) 0%, rgba(5,7,13,0.1) 40%, rgba(5,7,13,0.85) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* Floating Center Badge during opening 120 frames */}
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: 48,
          background: 'rgba(220, 38, 38, 0.9)',
          padding: '8px 24px',
          borderRadius: 8,
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
          zIndex: 35,
        }}
      >
        TIÊU ĐIỂM THỂ THAO • 08/11/2026
      </div>

      {/* Broadcast Lower Third Graphics Bar (16:9 Landscape) */}
      <BroadcastLowerThird
        category={category}
        headline={headline}
        subline={subline}
        source={source}
      />
    </AbsoluteFill>
  );
};
