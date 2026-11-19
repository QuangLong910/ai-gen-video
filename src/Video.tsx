import React from 'react';
import { AbsoluteFill } from 'remotion';
import { VideoContent } from './VideoContent';

export interface VideoProps {
  slug: string;
  channelId?: string;
  showSubtitles?: boolean;
}

export const Video: React.FC<VideoProps> = ({ slug, channelId, showSubtitles = false }) => (
  <AbsoluteFill>
    <VideoContent slug={slug} channelId={channelId} showSubtitles={showSubtitles} />
  </AbsoluteFill>
);
