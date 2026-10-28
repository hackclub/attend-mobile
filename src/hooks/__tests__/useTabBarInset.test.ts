jest.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 0, height: 0 }),
}));
jest.mock('react-native-bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

import { resolveTabBarInset } from '../useTabBarInset';

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
