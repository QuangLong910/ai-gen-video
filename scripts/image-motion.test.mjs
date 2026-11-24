import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_MOTION_PRESETS,
  SLIDE_TRANSITIONS,
  computeImageMotionStyle,
  computeOverlappingMediaSlices,
  pickMotionPreset,
  pickSlideTransition,
} from '../src/scenes/imageMotion.ts';

test('tất cả 6 preset chuyển động trả về số hữu hạn, scale an toàn [1.01, 1.12] và transform hợp lệ', () => {
  for (const preset of IMAGE_MOTION_PRESETS) {
    for (const transition of SLIDE_TRANSITIONS) {
      const durations = [1, 30, 90];
      for (const dur of durations) {
        const framesToTest = dur === 1 ? [0] : [0, Math.floor(dur / 2), dur - 1];
        for (const f of framesToTest) {
          const style = computeImageMotionStyle({
            localFrame: f,
            durationInFrames: dur,
            preset,
            enterFrames: 10,
            transition,
            isFirstSlide: false,
          });
          assert.ok(Number.isFinite(style.scale), `${preset} scale không hợp lệ`);
          assert.ok(Number.isFinite(style.translateX), `${preset} translateX không hợp lệ`);
          assert.ok(Number.isFinite(style.translateY), `${preset} translateY không hợp lệ`);
          assert.ok(Number.isFinite(style.rotateDeg), `${preset} rotateDeg không hợp lệ`);
          assert.ok(Number.isFinite(style.opacity), `${preset} opacity không hợp lệ`);
          assert.ok(Number.isFinite(style.brightness), `${preset} brightness không hợp lệ`);
          assert.ok(Number.isFinite(style.flashOpacity), `${preset} flashOpacity không hợp lệ`);
          assert.ok(style.scale >= 1.01 && style.scale <= 1.12, `${preset} scale=${style.scale} ngoài ngưỡng an toàn [1.01, 1.12]`);
          assert.ok(!style.transform.includes('NaN'), `${preset} transform chứa NaN`);
          assert.ok(style.transform.includes('translate3d('));
          assert.ok(style.transform.includes('scale('));
          assert.ok(style.transform.includes('rotate('));
        }
      }
    }
  }
});

test('pickMotionPreset & pickSlideTransition tạo chuyển động đa dạng và video luôn dùng crossfade-zoom', () => {
  const presets = new Set();
  const transitions = new Set();
  for (let scene = 0; scene < 4; scene++) {
    for (let slide = 0; slide < 3; slide++) {
      presets.add(pickMotionPreset(scene, slide, scene % 2 === 0 ? 'left-to-right' : 'right-to-left'));
      transitions.add(pickSlideTransition(scene, slide, 'image'));
      assert.equal(pickSlideTransition(scene, slide, 'video'), 'crossfade-zoom');
    }
  }
  assert.ok(presets.size >= 5, `Cần đa dạng preset, thực tế: ${presets.size}`);
  assert.ok(transitions.size >= 4, `Cần đa dạng kiểu chuyển ảnh, thực tế: ${transitions.size}`);
  assert.equal(pickMotionPreset(0, 0, 'vertical-scroll'), 'drift-up-focus');
});

test('computeOverlappingMediaSlices xử lý 0, 1, 3, 5 tư liệu hỗn hợp và phủ kín [0, totalFrames]', () => {
  assert.deepEqual(computeOverlappingMediaSlices([], 120), []);

  const single = computeOverlappingMediaSlices([{type: 'image', src: 'crop_0.jpg'}], 120, 1);
  assert.equal(single.length, 1);
  assert.equal(single[0].from, 0);
  assert.equal(single[0].duration, 120);
  assert.equal(single[0].enterFrames, 0);

  for (const count of [3, 5]) {
    const items = Array.from({length: count}, (_, i) => ({
      type: i === 1 ? 'video' : 'image',
      src: i === 1 ? 'video_0.mp4' : `crop_${i}.jpg`,
    }));
    const totalFrames = 240;
    const slices = computeOverlappingMediaSlices(items, totalFrames, 2);

    assert.equal(slices.length, count);
    assert.equal(slices[0].from, 0);
    assert.equal(slices[0].enterFrames, 0);

    for (let i = 0; i < slices.length; i++) {
      assert.ok(slices[i].from >= 0, 'from không được âm');
      assert.ok(slices[i].duration > 0, 'duration phải dương');
      if (i > 0) {
        assert.ok(slices[i].enterFrames > 0, `slice ${i} phải có overlap enterFrames > 0`);
      }
    }

    const last = slices[slices.length - 1];
    assert.equal(last.from + last.duration, totalFrames, 'slice cuối phải kết thúc đúng totalFrames');
  }
});

test('computeImageMotionStyle giữ slide đầu opacity=1 và chuyển mượt slide sau về opacity=1, flashOpacity=0', () => {
  const firstAt0 = computeImageMotionStyle({
    localFrame: 0,
    durationInFrames: 90,
    preset: 'zoom-in-punch',
    enterFrames: 0,
    transition: 'crossfade-zoom',
    isFirstSlide: true,
  });
  assert.equal(firstAt0.opacity, 1);
  assert.equal(firstAt0.flashOpacity, 0);

  const nextAt0 = computeImageMotionStyle({
    localFrame: 0,
    durationInFrames: 90,
    preset: 'pan-left-zoom',
    enterFrames: 10,
    transition: 'zoom-flash',
    isFirstSlide: false,
  });
  assert.equal(nextAt0.opacity, 0);
  assert.ok(nextAt0.flashOpacity >= 0.14, 'flashOpacity tại localFrame=0 phải >= 0.14');

  const nextAtEnd = computeImageMotionStyle({
    localFrame: 10,
    durationInFrames: 90,
    preset: 'pan-left-zoom',
    enterFrames: 10,
    transition: 'zoom-flash',
    isFirstSlide: false,
  });
  assert.equal(nextAtEnd.opacity, 1);
  assert.equal(nextAtEnd.flashOpacity, 0);
});
