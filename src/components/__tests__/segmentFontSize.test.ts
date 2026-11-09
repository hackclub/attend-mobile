import { iosSegmentFontSize } from '../ui/segmentFontSize';

describe('iosSegmentFontSize', () => {
  it('keeps the system size when every label fits its share', () => {
    expect(iosSegmentFontSize(['All', 'Any'], 200)).toBe(13);
  });

  it('steps the font down for a label that would be cut off', () => {
    // "Scheduled · 12" needs ~129pt at 13pt and ~121pt at 12pt.
    expect(iosSegmentFontSize(['All', 'Drafts · 3', 'Scheduled · 12', 'Sent'], 500)).toBe(12);
    expect(iosSegmentFontSize(['All', 'Drafts · 3', 'Scheduled · 12', 'Sent'], 358)).toBe(11);
  });

  it('uses the system size before the control is laid out', () => {
    expect(iosSegmentFontSize(['Light', 'Dark'], 0)).toBe(13);
  });

  it('scales with the text size, capped like other chrome', () => {
    expect(iosSegmentFontSize(['All', 'Any'], 400, 1.2)).toBe(16);
    expect(iosSegmentFontSize(['All', 'Any'], 400, 3)).toBe(18);
    expect(iosSegmentFontSize(['All', 'Any'], 400, 0.8)).toBe(13);
  });

  it('steps down from the scaled size', () => {
    // "Scheduled · 12" needs ~171pt at 18pt and ~163pt at 17pt.
    expect(iosSegmentFontSize(['All', 'Drafts · 3', 'Scheduled · 12', 'Sent'], 680, 1.4)).toBe(17);
  });
});
