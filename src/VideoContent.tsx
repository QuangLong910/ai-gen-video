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
  slug = '2026-11-19-video-bong-da-u17-phap-u17-hai-1535',
  showSubtitles = false,
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
      <Audio src={staticFile('2026-11-19-video-bong-da-u17-phap-u17-hai-1535/voice.mp3')} volume={1.0} />
      <Audio src={staticFile('assets/news/music/the_mountain-news-news-music.mp3')} volume={0.10} loop />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={sequenceDurations[0]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={0}
            images={["crop_0.jpg","crop_1.jpg"]}
            title="U17 PHÁP THỊ UY SỨC MẠNH"
            subtitle="U17 Pháp thể hiện sức mạnh áp đảo tại U17 World Cup"
            source="THEO: 24H.COM.VN"
            date="20/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="🚨 TIN CỰC NÓNG"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition1.presentation} timing={transition1.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[1]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            sceneIndex={1}
            images={["crop_2.jpg","crop_3.jpg"]}
            title="MERRIFIELD TỎA SÁNG RỰC RỠ"
            subtitle="Merrifield lập cú đúp đưa U17 Pháp vươn lên dẫn trước"
            source="THEO: 24H.COM.VN"
            date="20/11/2026"
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
            images={["crop_2.jpg","crop_0.jpg"]}
            title="ĐẲNG CẤP ĐỘI TRẺ"
            subtitle="Noha Tiehi ghi bàn nâng tỷ số lên ba không cho U17 Pháp"
            source="THEO: 24H.COM.VN"
            date="20/11/2026"
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
            images={["crop_3.jpg","crop_1.jpg"]}
            title="CHIẾN THẮNG THUYẾT PHỤC"
            subtitle="Chung cuộc U17 Pháp đánh bại U17 Haiti với tỷ số ba một"
            source="THEO: 24H.COM.VN"
            date="20/11/2026"
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
