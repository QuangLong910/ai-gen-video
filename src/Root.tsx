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
        slug: '2026-11-24-ngay-van-hoa-viet-nam-2411',
        showSubtitles: true,
      }}
    />
  );
};

registerRoot(RemotionRoot);
