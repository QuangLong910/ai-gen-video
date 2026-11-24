export type ImageMotionPreset =
  | 'zoom-in-punch'
  | 'pan-left-zoom'
  | 'zoom-out-reveal'
  | 'pan-right-tilt'
  | 'drift-up-focus'
  | 'diagonal-glide';

export type SlideTransitionType =
  | 'crossfade-zoom'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'zoom-flash';

export type PanDirection = 'left-to-right' | 'right-to-left' | 'vertical-scroll';

export interface MediaItem {
  type: 'image' | 'video';
  src: string;
  startFrom?: number;
  durationSec?: number;
  motionPreset?: ImageMotionPreset;
}

export interface MediaSlice {
  item: MediaItem;
  from: number;
  duration: number;
  enterFrames: number;
  transition: SlideTransitionType;
  motionPreset: ImageMotionPreset;
}

export interface ImageMotionFrameStyle {
  scale: number;
  translateX: number;
  translateY: number;
  rotateDeg: number;
  opacity: number;
  brightness: number;
  flashOpacity: number;
  transform: string;
}

export const IMAGE_MOTION_PRESETS: readonly ImageMotionPreset[] = [
  'zoom-in-punch',
  'pan-left-zoom',
  'zoom-out-reveal',
  'pan-right-tilt',
  'drift-up-focus',
  'diagonal-glide',
];

export const SLIDE_TRANSITIONS: readonly SlideTransitionType[] = [
  'crossfade-zoom',
  'slide-left',
  'zoom-flash',
  'slide-right',
  'slide-up',
];

export const DEFAULT_SLIDE_OVERLAP_FRAMES = 10;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

export function easeOutExpo(t: number): number {
  const c = clamp01(t);
  return c >= 1 ? 1 : 1 - Math.pow(2, -10 * c);
}

export function easeInOutSine(t: number): number {
  const c = clamp01(t);
  return -(Math.cos(Math.PI * c) - 1) / 2;
}

export function pickMotionPreset(
  sceneIndex: number,
  slideIndex: number,
  panDirection?: PanDirection,
): ImageMotionPreset {
  if (panDirection === 'vertical-scroll' && slideIndex === 0) {
    return 'drift-up-focus';
  }
  const dirOffset = panDirection === 'right-to-left' ? 1 : 0;
  const idx = Math.abs(sceneIndex * 2 + slideIndex + dirOffset) % IMAGE_MOTION_PRESETS.length;
  return IMAGE_MOTION_PRESETS[idx];
}

export function pickSlideTransition(
  sceneIndex: number,
  slideIndex: number,
  itemType: 'image' | 'video',
): SlideTransitionType {
  if (itemType === 'video') {
    return 'crossfade-zoom';
  }
  const idx = Math.abs(sceneIndex * 2 + slideIndex) % SLIDE_TRANSITIONS.length;
  return SLIDE_TRANSITIONS[idx];
}

export function computeOverlappingMediaSlices(
  items: readonly MediaItem[],
  totalFrames: number,
  sceneIndex = 0,
  panDirection?: PanDirection,
  overlapFrames = DEFAULT_SLIDE_OVERLAP_FRAMES,
  presetOverride?: ImageMotionPreset,
): MediaSlice[] {
  if (items.length === 0) return [];
  const safeTotal = Math.max(1, Math.round(totalFrames));

  if (items.length === 1) {
    return [
      {
        item: items[0],
        from: 0,
        duration: safeTotal,
        enterFrames: 0,
        transition: 'crossfade-zoom',
        motionPreset: items[0].motionPreset ?? presetOverride ?? pickMotionPreset(sceneIndex, 0, panDirection),
      },
    ];
  }

  const weights = items.map((it) => (it.type === 'video' ? 1.6 : 1.0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const baseStarts: number[] = [];
  const baseDurations: number[] = [];
  let cursor = 0;

  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1;
    const dur = isLast
      ? Math.max(1, safeTotal - cursor)
      : Math.max(15, Math.round((weights[i] / totalWeight) * safeTotal));
    baseStarts.push(cursor);
    baseDurations.push(dur);
    cursor += dur;
  }

  // Ensure the last slice never goes past safeTotal if earlier items were clamped to 15 frames
  if (cursor > safeTotal && baseDurations.length > 0) {
    const scaleFactor = safeTotal / cursor;
    let adjustedCursor = 0;
    for (let i = 0; i < items.length; i++) {
      const isLast = i === items.length - 1;
      const dur = isLast
        ? Math.max(1, safeTotal - adjustedCursor)
        : Math.max(1, Math.round(baseDurations[i] * scaleFactor));
      baseStarts[i] = adjustedCursor;
      baseDurations[i] = dur;
      adjustedCursor += dur;
    }
  }

  const slices: MediaSlice[] = [];
  for (let i = 0; i < items.length; i++) {
    const motionPreset = items[i].motionPreset ?? presetOverride ?? pickMotionPreset(sceneIndex, i, panDirection);
    const transition = pickSlideTransition(sceneIndex, i, items[i].type);

    if (i === 0) {
      slices.push({
        item: items[i],
        from: 0,
        duration: Math.max(1, baseDurations[0]),
        enterFrames: 0,
        transition: 'crossfade-zoom',
        motionPreset,
      });
      continue;
    }

    const safeOverlap = Math.max(
      0,
      Math.min(
        overlapFrames,
        Math.floor(baseDurations[i - 1] / 3),
        Math.floor(baseDurations[i] / 3),
      ),
    );
    const from = Math.max(0, baseStarts[i] - safeOverlap);
    const actualEnter = baseStarts[i] - from;
    const duration = Math.max(1, baseDurations[i] + actualEnter);

    slices.push({
      item: items[i],
      from,
      duration,
      enterFrames: actualEnter,
      transition,
      motionPreset,
    });
  }

  return slices;
}

export function computeImageMotionStyle(params: {
  localFrame: number;
  durationInFrames: number;
  preset: ImageMotionPreset;
  enterFrames: number;
  transition: SlideTransitionType;
  isFirstSlide: boolean;
}): ImageMotionFrameStyle {
  const {localFrame, durationInFrames, preset, enterFrames, transition, isFirstSlide} = params;
  const f = Math.max(0, localFrame);
  const p = durationInFrames <= 1 ? 1 : clamp01(f / (durationInFrames - 1));
  const e = easeInOutSine(p);

  const breathX = Math.sin(f * 0.08) * 3;
  const breathY = Math.cos(f * 0.06) * 2.5;

  let baseScale = 1.1;
  let baseTx = 0;
  let baseTy = 0;
  let baseRot = 0;

  switch (preset) {
    case 'zoom-in-punch': {
      const punch = (1 - easeOutExpo(clamp01(f / 10))) * 0.02;
      baseScale = lerp(1.01, 1.04, e) + punch;
      baseTx = lerp(-6, 6, e);
      baseTy = lerp(4, -4, e);
      baseRot = lerp(-0.2, 0.2, e);
      break;
    }
    case 'pan-left-zoom': {
      baseScale = lerp(1.02, 1.05, e);
      baseTx = lerp(-10, 10, e);
      baseTy = lerp(3, -3, e);
      baseRot = lerp(0, 0.2, e);
      break;
    }
    case 'zoom-out-reveal': {
      baseScale = lerp(1.05, 1.01, e);
      baseTx = lerp(6, -6, e);
      baseTy = lerp(6, -6, e);
      baseRot = lerp(0.2, -0.2, e);
      break;
    }
    case 'pan-right-tilt': {
      baseScale = lerp(1.02, 1.05, e);
      baseTx = lerp(10, -10, e);
      baseTy = lerp(-3, 3, e);
      baseRot = lerp(-0.2, 0.2, e);
      break;
    }
    case 'drift-up-focus': {
      baseScale = lerp(1.02, 1.05, e);
      baseTx = lerp(-4, 4, e);
      baseTy = lerp(8, -8, e);
      baseRot = lerp(0.1, -0.1, e);
      break;
    }
    case 'diagonal-glide': {
      baseScale = lerp(1.02, 1.05, e);
      baseTx = lerp(-8, 8, e);
      baseTy = lerp(6, -6, e);
      baseRot = lerp(0.2, -0.2, e);
      break;
    }
  }

  let opacity = 1;
  let extraScale = 0;
  let extraX = 0;
  let extraY = 0;
  let brightness = 1;
  let flashOpacity = 0;

  if (!isFirstSlide && enterFrames > 0) {
    const enterT = clamp01(f / Math.max(1, enterFrames));
    const en = easeOutCubic(enterT);

    switch (transition) {
      case 'crossfade-zoom':
        opacity = en;
        extraScale = (1 - en) * 0.03;
        brightness = 1 + (1 - en) * 0.1;
        break;
      case 'slide-left':
        opacity = 0.25 + 0.75 * en;
        extraX = (1 - en) * 45;
        extraScale = (1 - en) * 0.02;
        break;
      case 'slide-right':
        opacity = 0.25 + 0.75 * en;
        extraX = -(1 - en) * 45;
        extraScale = (1 - en) * 0.02;
        break;
      case 'slide-up':
        opacity = 0.25 + 0.75 * en;
        extraY = (1 - en) * 35;
        extraScale = (1 - en) * 0.02;
        break;
      case 'zoom-flash':
        opacity = en;
        extraScale = (1 - en) * 0.04;
        brightness = 1 + (1 - en) * 0.15;
        flashOpacity = (1 - en) * 0.15;
        break;
    }
  } else if (isFirstSlide) {
    opacity = 1;
    brightness = 1 + (1 - easeOutCubic(clamp01(f / 8))) * 0.08;
    flashOpacity = 0;
  }

  const scale = baseScale + extraScale;
  const translateX = baseTx + breathX + extraX;
  const translateY = baseTy + breathY + extraY;
  const rotateDeg = baseRot;
  const transform = `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${rotateDeg.toFixed(3)}deg)`;

  return {
    scale,
    translateX,
    translateY,
    rotateDeg,
    opacity,
    brightness,
    flashOpacity,
    transform,
  };
}
