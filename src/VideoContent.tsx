import React from 'react';
import {Audio, staticFile, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {SocialContentScene} from './scenes/SocialContentScene';
import {Subtitles} from './components/Subtitles';
import {SCENE1_DUR, SCENE2_DUR, SCENE3_DUR, SCENE4_DUR, TOTAL_FRAMES} from './scenes/tokens';

export interface VideoContentProps {
  slug?: string;
  showSubtitles?: boolean;
}

export const VideoContent: React.FC<VideoContentProps> = ({
  slug = '2026-11-24-ngay-van-hoa-viet-nam-2411',
  showSubtitles = true,
}) => {
  const transitionTiming = linearTiming({durationInFrames: 15});
  const springTransitionTiming = springTiming({durationInFrames: 15, config: {damping: 200}});
  const transition1 = {presentation: slide({direction: 'from-right'}), timing: springTransitionTiming};
  const transition2 = {presentation: wipe({direction: 'from-left'}), timing: transitionTiming};
  const transition3 = {presentation: slide({direction: 'from-bottom'}), timing: springTransitionTiming};

  const sequenceDurations = [
    SCENE1_DUR + 15,
    SCENE2_DUR + 15,
    SCENE3_DUR + 15,
    SCENE4_DUR,
  ];

  return (
    <div style={{flex: 1, backgroundColor: '#000000', position: 'relative', width: 1080, height: 1920}}>
      <Audio src={staticFile('2026-11-24-ngay-van-hoa-viet-nam-2411/voice.mp3')} volume={1.0} />
      <Audio src={staticFile('assets/news/music/the_mountain-news-news-music.mp3')} volume={0.10} loop />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={sequenceDurations[0]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={0}
            media={[{"type":"image","src":"crop_s1_aodai_laodong.jpg","caption":"Hôm nay 24.11 là Ngày Văn hóa Việt Nam (Ảnh: Lê Tuyến / Báo Lao Động)","isChart":false},{"type":"image","src":"crop_s1_hoinghi1946_lichsu.jpg","caption":"Chủ tịch Hồ Chí Minh tại Hội nghị Văn hóa toàn quốc 1946","isChart":false},{"type":"image","src":"crop_s1_chinhphu_ngayvanhoa.jpg","caption":"Nghị quyết chọn 24.11 là Ngày Văn hóa Việt Nam","isChart":true}]}
            title="NGÀY VĂN HÓA VIỆT NAM"
            subtitle="Ngày 24.11 chính thức là Ngày Văn hóa Việt Nam"
            source="THEO: BÁO LAO ĐỘNG"
            date="24/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="🚨 TIN NÓNG"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition1.presentation} timing={transition1.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[1]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={1}
            media={[{"type":"image","src":"crop_s2_graphic_honghot.jpg","caption":"Đồ họa: Hóng Hớt 24/7 - Hiệu lực từ 01/07/2026","isChart":true},{"type":"image","src":"crop_s2_lehoi_aodai.jpg","caption":"Không khí ngày hội văn hóa tưng bừng trên cả nước","isChart":false}]}
            title="NĂM ĐẦU TIÊN NGHỈ LỄ"
            subtitle="Hiệu lực thi hành từ ngày 01/07/2026"
            source="THEO: BÁO LAO ĐỘNG"
            date="24/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="⚡ DIỄN BIẾN MỚI"
            layoutMode="classic"
            panDirection="right-to-left"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition2.presentation} timing={transition2.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[2]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={2}
            media={[{"type":"image","src":"crop_s3_graphic_13diadiem.jpg","caption":"Danh mục 13 địa điểm miễn phí vé theo Thông tư 167 Bộ Tài chính","isChart":true},{"type":"image","src":"crop_s3_bt_dantochoc.jpg","caption":"Bảo tàng Dân tộc học Việt Nam tại Hà Nội","isChart":false},{"type":"image","src":"crop_s3_ditich_phoco.jpg","caption":"Không gian triển lãm di sản văn hóa truyền thống","isChart":false}]}
            title="MIỄN PHÍ 13 ĐIỂM ĐẾN"
            subtitle="Theo Thông tư 167 của Bộ Tài chính"
            source="THEO: BÁO LAO ĐỘNG"
            date="24/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="📌 CHI TIẾT ĐẮT GIÁ"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition3.presentation} timing={transition3.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[3]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={3}
            media={[{"type":"image","src":"crop_s4_muonsac_mydinh.jpg","caption":"Đại nhạc hội Muôn sắc Việt Nam tại SVĐ Mỹ Đình","isChart":false},{"type":"image","src":"crop_s4_phaohoa_mydinh.jpg","caption":"Bắn pháo hoa rực rỡ chào mừng Ngày Văn hóa Việt Nam","isChart":false},{"type":"image","src":"crop_s4_nghethuat_dinhco.jpg","caption":"Không gian văn hóa truyền thống phong phú đời sống tinh thần","isChart":false}]}
            title="KỲ NGHỈ Ý NGHĨA"
            subtitle="Cơ hội khám phá di sản và nghỉ ngơi"
            source="THEO: BÁO LAO ĐỘNG"
            date="24/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="🔔 THEO DÕI NGAY"
            layoutMode="classic"
            panDirection="right-to-left"
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {showSubtitles && (
        <Subtitles
          slug={slug}
          activeColor="#FACC15"
          fontSize={38}
          bottom="8.5%"
          maxWords={6}
        />
      )}
    </div>
  );
};
