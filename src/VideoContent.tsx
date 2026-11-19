import React from 'react';
import {Audio, staticFile, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {SocialContentScene} from './scenes/SocialContentScene';
import {Subtitles} from './components/Subtitles';
import {SCENE1_DUR, SCENE2_DUR, SCENE3_DUR, SCENE4_DUR, TOTAL_FRAMES} from './scenes/tokens';

export interface VideoContentProps {
  slug?: string;
  showSubtitles?: boolean;
}

export const VideoContent: React.FC<VideoContentProps> = ({
  slug = '2026-11-19-de-xuat-khong-phat-xe-di-qua-v-9810',
  showSubtitles = false,
}) => {
  const transitionTiming = linearTiming({durationInFrames: 15});
  const transition1 = {presentation: fade(), timing: transitionTiming};
  const transition2 = {presentation: slide({direction: 'from-right'}), timing: transitionTiming};
  const transition3 = {presentation: fade(), timing: transitionTiming};

  const sequenceDurations = [
    SCENE1_DUR + 15,
    SCENE2_DUR + 15,
    SCENE3_DUR + 15,
    SCENE4_DUR,
  ];

  return (
    <div style={{flex: 1, backgroundColor: '#000000', position: 'relative', width: 1080, height: 1920}}>
      <Audio src={staticFile('2026-11-19-de-xuat-khong-phat-xe-di-qua-v-9810/voice.mp3')} volume={1.0} />
      <Audio src={staticFile('assets/news/music/the_mountain-news-news-music.mp3')} volume={0.10} loop />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={sequenceDurations[0]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={["crop_0.jpg","crop_1.jpg"]}
            title="CHẤN ĐỘNG QUY ĐỊNH ĐÈN ĐỎ"
            subtitle="Đề xuất mới nhất về lỗi vượt đèn đỏ và đèn vàng từ cơ quan chức năng"
            source="THEO: BÁO TUỔI TRẺ"
            date="19/11/2026"
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
            images={["crop_2.jpg","crop_3.jpg"]}
            title="ĐÈN VÀNG KHÔNG BỊ PHẠT"
            subtitle="Xe đi qua vạch dừng khi đèn vàng sẽ không còn bị xử phạt"
            source="THEO: BÁO TUỔI TRẺ"
            date="19/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="💡 TIN VUI TÀI XẾ"
            layoutMode="classic"
            panDirection="right-to-left"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition2.presentation} timing={transition2.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[2]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={["crop_2.jpg","crop_0.jpg"]}
            title="TÁI PHẠM PHẠT GẤP BA"
            subtitle="Vượt đèn đỏ nhiều lần sẽ bị phạt tiền lũy kế và trừ điểm giấy phép lái xe"
            source="THEO: BÁO TUỔI TRẺ"
            date="19/11/2026"
            keepBanner={true}
            channelName="HÓNG HỚT 24/7"
            watermarkSrc="watermark.png"
            categoryTag="⚡ XỬ LÝ NẶNG TAY"
            layoutMode="classic"
            panDirection="left-to-right"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={transition3.presentation} timing={transition3.timing} />

        <TransitionSeries.Sequence durationInFrames={sequenceDurations[3]} premountFor={30}>
          <SocialContentScene
            slug={slug}
            images={["crop_3.jpg","crop_1.jpg"]}
            title="PHẠT NGUỘI QUA CAMERA"
            subtitle="Hệ thống camera giám sát ghi nhận toàn bộ vi phạm để xử lý phạt nguội"
            source="THEO: BÁO TUỔI TRẺ"
            date="19/11/2026"
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
