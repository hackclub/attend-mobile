import { withAlpha } from '../alpha';

describe('withAlpha', () => {
  it('converts 6- and 3-digit hex', () => {
    expect(withAlpha('#0f141a', 0.1)).toBe('rgba(15,20,26,0.1)');
    expect(withAlpha('#fff', 0.12)).toBe('rgba(255,255,255,0.12)');
  });

  it('multiplies an existing alpha', () => {
    expect(withAlpha('#00000080', 0.5)).toBe('rgba(0,0,0,0.251)');
    expect(withAlpha('rgba(255,255,255,0.5)', 0.5)).toBe('rgba(255,255,255,0.25)');
    expect(withAlpha('rgb(1, 2, 3)', 0.2)).toBe('rgba(1,2,3,0.2)');
  });

  it('clamps alpha and leaves unknown colours alone', () => {
    expect(withAlpha('#000000', 2)).toBe('rgba(0,0,0,1)');
    expect(withAlpha('transparent', 0.5)).toBe('transparent');
  });
});
