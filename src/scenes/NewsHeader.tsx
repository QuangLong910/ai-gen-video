import React from 'react';
import {Img, staticFile} from 'remotion';

interface NewsHeaderProps {
  source?: string;
  channelName?: string;
  watermarkSrc?: string;
}

export const NewsHeader: React.FC<NewsHeaderProps> = ({
  source = 'NGUỒN: BÁO QUÂN ĐỘI NHÂN DÂN',
  channelName = 'HÓNG HỚT 24/7',
  watermarkSrc = 'watermark.png',
}) => (
  <div
    style={{
      position: 'absolute',
      top: 60,
      left: 48,
      right: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 20,
      pointerEvents: 'none',
    }}
  >
    {/* Source Tag */}
    <div
      style={{
        padding: '8px 18px',
        borderRadius: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{color: '#E2E8F0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5}}>
        {source}
      </span>
    </div>

    {/* Brand Watermark on Top-Right */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 14px 6px 6px',
        borderRadius: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
      }}
    >
      <Img
        src={staticFile(watermarkSrc)}
        style={{width: 52, height: 52, borderRadius: 9999}}
      />
      <span style={{color: '#FFFFFF', fontSize: 18, fontWeight: 900, letterSpacing: 1}}>
        {channelName}
      </span>
    </div>
  </div>
);
