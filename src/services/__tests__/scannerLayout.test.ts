import { scanFrameSize } from '../scannerLayout';

describe('scanFrameSize', () => {
  it('is about 70% of a phone’s width', () => {
    expect(scanFrameSize(412, 915, false)).toBe(288);
    expect(scanFrameSize(390, 844, false)).toBe(273);
  });

  it('keeps to under half a short phone’s height', () => {
    expect(scanFrameSize(412, 500, false)).toBe(225);
  });

  it('is half a tablet’s shorter side, capped', () => {
    expect(scanFrameSize(820, 1180, true)).toBe(410);
    expect(scanFrameSize(1366, 1024, true)).toBe(460);
  });
});
