jest.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 0, height: 0 }),
  Platform: { OS: 'ios', isPad: false },
}));

import {
  resolveResponsiveLayout,
  REGULAR_MIN_WIDTH,
  SPLIT_MIN_WIDTH,
} from '../useResponsiveLayout';

describe('resolveResponsiveLayout', () => {
  it('keeps a phone-width scene on a single column', () => {
    // iPhone Duo folded / outer display.
    const layout = resolveResponsiveLayout(390, 844);
    expect(layout.isCompact).toBe(true);
    expect(layout.isRegular).toBe(false);
    expect(layout.useSplitView).toBe(false);
  });

  it('splits a scene wide enough for both panes, portrait included', () => {
    // iPhone Duo unfolded: taller than it is wide, but not a phone column.
    const layout = resolveResponsiveLayout(SPLIT_MIN_WIDTH, SPLIT_MIN_WIDTH + 120);
    expect(layout.isLandscape).toBe(false);
    expect(layout.isRegular).toBe(true);
    expect(layout.useSplitView).toBe(true);
  });

  it('gives a regular-width scene the roomier layout before it splits', () => {
    const layout = resolveResponsiveLayout(REGULAR_MIN_WIDTH, 900);
    expect(layout.isRegular).toBe(true);
    expect(layout.useSplitView).toBe(false);
  });

  it('still splits an iPad in landscape', () => {
    expect(resolveResponsiveLayout(1180, 820).useSplitView).toBe(true);
  });
});
