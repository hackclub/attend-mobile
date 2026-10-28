jest.mock('react-native', () => ({
  Platform: { OS: 'ios', isPad: false, Version: '26.5' },
  useWindowDimensions: () => ({ width: 0, height: 0 }),
}));
jest.mock('react-native-bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

import { resolveTabBarInset, resolveTopTabBarInset } from '../useTabBarInset';

describe('resolveTabBarInset', () => {
  it('reserves space for a normal bottom bar', () => {
    // iPhone-sized scene with the usual native tab bar.
    expect(resolveTabBarInset(83, 844)).toBe(83);
  });

  it('ignores a bar reported as tall as the whole scene', () => {
    // iPhone Duo folded: the bar adapts to a full-height side rail.
    expect(resolveTabBarInset(678, 678)).toBe(0);
  });

  it('ignores a rail that covers most of a taller scene', () => {
    // iPhone Duo unfolded — still a rail, still no bottom space taken.
    expect(resolveTabBarInset(900, 951)).toBe(0);
  });

  it('treats a missing scene height as no inset', () => {
    expect(resolveTabBarInset(83, 0)).toBe(0);
  });
});

describe('resolveTopTabBarInset', () => {
  const iPad = { os: 'ios', isPad: true, version: '26.5' };

  it('leaves room for the bar an iPad floats along the top', () => {
    expect(resolveTopTabBarInset(iPad, 1376)).toBe(56);
    expect(resolveTopTabBarInset(iPad, 1032)).toBe(56);
  });

  it('leaves none for a compact iPad scene, which keeps the bottom bar', () => {
    // Slide Over or a narrow split.
    expect(resolveTopTabBarInset(iPad, 375)).toBe(0);
  });

  it('leaves none on an iPad older than the floating bar', () => {
    expect(resolveTopTabBarInset({ ...iPad, version: '17.5' }, 1376)).toBe(0);
  });

  it('leaves none on a phone, however wide the scene', () => {
    // iPhone Duo unfolded is regular width but gets a side rail, not a top bar.
    expect(resolveTopTabBarInset({ os: 'ios', isPad: false, version: '27.1' }, 951)).toBe(0);
    expect(resolveTopTabBarInset({ os: 'android', isPad: false, version: 36 }, 1200)).toBe(0);
  });
});
