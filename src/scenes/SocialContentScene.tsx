import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/google-fonts/BeVietnamPro';
import {NewsHeader} from './NewsHeader';
import {
  computeImageMotionStyle,
  computeOverlappingMediaSlices,
  easeOutCubic,
  clamp01,
  type ImageMotionPreset,
  type MediaItem,
  type SlideTransitionType,
} from './imageMotion';

export type {MediaItem, ImageMotionPreset};

const {fontFamily} = loadFont('normal', {
  weights: ['600', '700', '800', '900'],
  subsets: ['latin', 'vietnamese'],
});

export interface SocialContentSceneProps {
  slug: string;
  image?: string;
  images?: string[]; // Hỗ trợ mảng ảnh để đổi ảnh nhanh 2.5s - 3s/ảnh
  media?: MediaItem[]; // Hỗ trợ mảng tư liệu hỗn hợp (cả ảnh & video) trong cùng 1 cảnh
  videoSrc?: string;
  startFrom?: number;
  title?: string;
  subtitle?: string;
  source?: string;
  date?: string;
  panDirection?: 'left-to-right' | 'right-to-left' | 'vertical-scroll';
  sceneIndex?: number;
  motionPreset?: ImageMotionPreset;
  keepBanner?: boolean;
  channelName?: string;
  watermarkSrc?: string;
  bannerSrc?: string;
  layoutMode?: 'mobile-retention' | 'classic';
  categoryTag?: string;
  hideTitle?: boolean;
}

function resolveMediaPath(slug: string, src: string, isLegacyVideo = false): string {
  if (src.includes('/')) {
    return `${slug}/${src}`;
  }
  return isLegacyVideo ? `${slug}/${src}` : `${slug}/evidence/${src}`;
}

interface MediaSlideProps {
  slug: string;
  item: MediaItem;
  durationInFrames: number;
  preset: ImageMotionPreset;
  enterFrames: number;
  transition: SlideTransitionType;
  isFirstSlide: boolean;
  zIndex: number;
  width: number;
  height: number;
  isLegacyVideo?: boolean;
}

const MediaSlide: React.FC<MediaSlideProps> = ({
  slug,
  item,
  durationInFrames,
  preset,
  enterFrames,
  transition,
  isFirstSlide,
  zIndex,
  width,
  height,
  isLegacyVideo = false,
}) => {
  const localFrame = useCurrentFrame();
  const resolvedPath = staticFile(resolveMediaPath(slug, item.src, isLegacyVideo));

  if (item.type === 'video') {
    const videoOpacity =
      !isFirstSlide && enterFrames > 0 ? easeOutCubic(clamp01(localFrame / enterFrames)) : 1;
    const videoScale = interpolate(
      localFrame,
      [0, Math.max(1, durationInFrames)],
      [1.0, 1.04],
      {extrapolateRight: 'clamp'}
    );

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width,
          height,
          overflow: 'hidden',
          backgroundColor: '#0A0E1A',
          opacity: videoOpacity,
          zIndex,
        }}
      >
        <OffthreadVideo
          src={resolvedPath}
          startFrom={item.startFrom || 0}
          muted
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            transform: `scale(${videoScale.toFixed(4)})`,
          }}
        />
      </div>
    );
  }

  const style = computeImageMotionStyle({
    localFrame,
    durationInFrames,
    preset,
    enterFrames,
    transition,
    isFirstSlide,
  });

  const sweepProgress = clamp01(localFrame / Math.max(1, durationInFrames));
  const sweepX = interpolate(sweepProgress, [0, 1], [-60, 60]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        overflow: 'hidden',
        opacity: style.opacity,
        zIndex,
      }}
    >
      {/* Lớp nền blur dự phòng bao trọn khung: Chống tuyệt đối lỗi viền đen hoặc ảnh co nhỏ + parallax nhẹ */}
      <Img
        src={resolvedPath}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          objectFit: 'cover',
          filter: 'blur(25px) brightness(0.7)',
          transform: `translate3d(${(-style.translateX * 0.25).toFixed(1)}px, ${(-style.translateY * 0.25).toFixed(1)}px, 0) scale(1.22)`,
        }}
      />
      <Img
        src={resolvedPath}
        style={{
          position: 'relative',
          width,
          height,
          objectFit: 'cover',
          transform: style.transform,
          filter: style.brightness > 1.005 ? `brightness(${style.brightness.toFixed(3)})` : undefined,
          willChange: 'transform',
        }}
      />
      {/* Cinematic light sweep */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)',
          transform: `translateX(${sweepX.toFixed(1)}%)`,
        }}
      />
      {/* Flash highlight cho zoom-flash transition */}
      {style.flashOpacity > 0.005 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundColor: `rgba(255,255,255,${style.flashOpacity.toFixed(3)})`,
          }}
        />
      )}
    </div>
  );
};

export const SocialContentScene: React.FC<SocialContentSceneProps> = ({
  slug,
  image = 'sharp_1.jpg',
  images,
  media,
  videoSrc,
  startFrom = 0,
  title = '',
  subtitle,
  source = 'THEO: BÁO DÂN TRÍ',
  date = '12/11/2026',
  panDirection = 'left-to-right',
  sceneIndex = 0,
  motionPreset,
  keepBanner = true,
  channelName = 'HÓNG HỚT 24/7',
  watermarkSrc = 'watermark.png',
  bannerSrc = 'assets/news/banner.png',
  layoutMode = 'classic', // Mặc định classic 50-50 để ảnh sắc nét full không bị mờ
  categoryTag,
  hideTitle = false,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  // ─── Chuẩn hóa danh sách tư liệu hỗn hợp (media -> videoSrc -> images -> image) ───
  const isLegacyVideo = !media && Boolean(videoSrc);
  const mediaList: MediaItem[] =
    media && media.length > 0
      ? media
      : videoSrc
        ? [{type: 'video', src: videoSrc, startFrom}]
        : images && images.length > 0
          ? images.map((src) => ({type: 'image', src}))
          : [{type: 'image', src: image}];

  const mediaSlices = computeOverlappingMediaSlices(
    mediaList,
    durationInFrames,
    sceneIndex,
    panDirection,
    undefined,
    motionPreset
  );

  const titleSpring = spring({frame: frame - 2, fps, config: {damping: 12, mass: 0.7}});

  // ──────────────────────────────────────────────────────────────────────────
  // BỐ CỤC 1: CLASSIC 50% BANNER (Theo yêu cầu: đưa banner lên 50% để ảnh căng tràn sắc nét, KHÔNG CÓ KHOẢNG MỜ)
  // ──────────────────────────────────────────────────────────────────────────
  if (layoutMode === 'classic') {
    return (
      <AbsoluteFill style={{backgroundColor: '#0A0E1A', fontFamily, overflow: 'hidden'}}>
        {/* ── NỬA TRÊN (0 - 1040px): TẤT CẢ TƯ LIỆU ẢNH & VIDEO CĂNG TRÀN SẮC NÉT ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1080,
            height: 1040,
            overflow: 'hidden',
            zIndex: 10,
          }}
        >
          <div style={{position: 'absolute', inset: 0, zIndex: 1}}>
            {mediaSlices.map((slice, idx) => (
              <Sequence
                key={`${slice.item.type}-${slice.item.src}-${idx}`}
                from={slice.from}
                durationInFrames={slice.duration}
                layout="none"
              >
                <MediaSlide
                  slug={slug}
                  item={slice.item}
                  durationInFrames={slice.duration}
                  preset={slice.motionPreset}
                  enterFrames={slice.enterFrames}
                  transition={slice.transition}
                  isFirstSlide={idx === 0}
                  zIndex={idx + 1}
                  width={1080}
                  height={1040}
                  isLegacyVideo={isLegacyVideo}
                />
              </Sequence>
            ))}
          </div>

          {/* Viền shadow nhẹ ngăn cách ảnh và banner */}
          <AbsoluteFill
            style={{
              zIndex: 10,
              pointerEvents: 'none',
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.9) 100%)',
            }}
          />

          {/* Top Header: Nguồn tin & Logo nhỏ */}
          <NewsHeader source={source} channelName={channelName} watermarkSrc={watermarkSrc} />
        </div>

        {/* ── NỬA DƯỚI (1025px - 1920px): BANNER THƯƠNG HIỆU GỐC 50% ── */}
        <AbsoluteFill
          style={{
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <Img
            src={staticFile(bannerSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              // translateY(0) đặt banner chuẩn 50% đúng với thiết kế gốc của banner.png!
              transform: 'translateY(0px)',
            }}
          />

          {/* TIÊU ĐỀ & NỘI DUNG NẰM CHÍNH GIỮA KHỐI BANNER ĐỎ */}
          {!hideTitle && title && (
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
                zIndex: 30,
                transform: `scale(${titleSpring})`,
              }}
            >
              {/* Badge Tag */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 20px',
                  borderRadius: 6,
                  backgroundColor: '#DC2626',
                  boxShadow: '0 4px 15px rgba(220, 38, 38, 0.8)',
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    color: '#FFFFFF',
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {categoryTag || '🔥 TIN NÓNG TIÊU DÙNG'}
                </span>
              </div>

              {/* Tiêu đề chính chữ vàng cực đại, viền đen dày */}
              <div
                style={{
                  color: '#FACC15',
                  fontSize: 58,
                  fontWeight: 900,
                  lineHeight: 1.25,
                  textTransform: 'uppercase',
                  textShadow:
                    '0 0 15px #000, 4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 0 6px 25px rgba(0,0,0,0.9)',
                  maxWidth: 960,
                }}
              >
                {title}
              </div>

              {/* Tóm tắt nội dung 1-2 dòng trong khung tối thanh lịch */}
              {subtitle && (
                <div
                  style={{
                    marginTop: 18,
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    padding: '10px 24px',
                    borderRadius: 20,
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    maxWidth: 920,
                  }}
                >
                  <span
                    style={{
                      color: '#FFFFFF',
                      fontSize: 28,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {subtitle}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Dòng ngày tháng & bản tin ở đáy */}
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
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BỐ CỤC 2: MOBILE-RETENTION (Banner 1/6 đáy)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <AbsoluteFill style={{backgroundColor: '#0A0E1A', fontFamily, overflow: 'hidden'}}>
      {/* ── Background: Ambient Glow ── */}
      <AbsoluteFill style={{overflow: 'hidden', backgroundColor: '#0A0E1A'}} />

      {/* ── VÙNG ẢNH / VIDEO LỚN ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          width: 1080,
          height: 1600,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <div style={{position: 'absolute', inset: 0, zIndex: 1}}>
          {mediaSlices.map((slice, idx) => (
            <Sequence
              key={`${slice.item.type}-${slice.item.src}-${idx}`}
              from={slice.from}
              durationInFrames={slice.duration}
              layout="none"
            >
              <MediaSlide
                slug={slug}
                item={slice.item}
                durationInFrames={slice.duration}
                preset={slice.motionPreset}
                enterFrames={slice.enterFrames}
                transition={slice.transition}
                isFirstSlide={idx === 0}
                zIndex={idx + 1}
                width={1080}
                height={1600}
                isLegacyVideo={isLegacyVideo}
              />
            </Sequence>
          ))}
        </div>

        <AbsoluteFill
          style={{
            zIndex: 10,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(10, 14, 26, 0.80) 0%, rgba(10, 14, 26, 0.20) 25%, rgba(10, 14, 26, 0.35) 60%, rgba(10, 14, 26, 0.90) 100%)',
          }}
        />

        <NewsHeader source={source} channelName={channelName} watermarkSrc={watermarkSrc} />

        {!hideTitle && title && (
          <div
            style={{
              position: 'absolute',
              top: 120,
              bottom: 0,
              left: 36,
              right: 36,
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${titleSpring})`,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 24px',
                borderRadius: 8,
                backgroundColor: '#DC2626',
                transform: 'skewX(-10deg)',
                boxShadow: '0 4px 18px rgba(220, 38, 38, 0.7)',
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  color: '#FFFFFF',
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  transform: 'skewX(10deg)',
                }}
              >
                {categoryTag || '🔥 TIN NÓNG ĐẶC BIỆT'}
              </span>
            </div>

            <div
              style={{
                color: '#FACC15',
                fontSize: 78,
                fontWeight: 900,
                lineHeight: 1.28,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '-0.5px',
                textShadow:
                  '0 0 12px #000, 0 0 25px #000, 4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 0 8px 35px rgba(0,0,0,1)',
                maxWidth: 1020,
                padding: '0 20px',
              }}
            >
              {title}
            </div>

            {subtitle && (
              <div
                style={{
                  marginTop: 24,
                  backgroundColor: 'rgba(0, 0, 0, 0.70)',
                  backdropFilter: 'blur(10px)',
                  padding: '12px 32px',
                  borderRadius: 28,
                  border: '1.5px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 25px rgba(0,0,0,0.6)',
                  maxWidth: 960,
                }}
              >
                <span
                  style={{
                    color: '#FFFFFF',
                    fontSize: 28,
                    fontWeight: 700,
                    lineHeight: 1.35,
                    letterSpacing: 0.2,
                    textAlign: 'center',
                    textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {subtitle}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BANNER 1/6 ĐÁY ── */}
      <AbsoluteFill
        style={{
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <Img
          src={staticFile(bannerSrc)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: 'translateY(630px)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: 48,
            right: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 18px',
              borderRadius: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
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
              TIN NÓNG 24H • {date}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
