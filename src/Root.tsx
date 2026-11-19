import {Composition, registerRoot} from 'remotion';
import {VideoContent} from './VideoContent';
import {TOTAL_FRAMES} from './scenes/tokens';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SocialVideo"
      component={VideoContent}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        slug: '2026-11-19-de-xuat-khong-phat-xe-di-qua-v-9810',
        showSubtitles: false,
      }}
    />
  );
};

registerRoot(RemotionRoot);
