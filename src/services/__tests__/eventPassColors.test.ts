import { passColorsFor, pickLogoColor, WALLET_PASS_RED } from '../eventPassColors';

const ios = (background: string, primary: string, secondary = '#000000', detail = '#000000') => ({
  platform: 'ios' as const,
  quality: 'low' as const,
  background,
  primary,
  secondary,
  detail,
});

describe('pickLogoColor', () => {
  it('uses the most common colour when it has colour in it', () => {
    expect(pickLogoColor(ios('#2b6cb0', '#ffffff'))).toBe('#2B6CB0');
  });

  it('looks past the white paper a logo sits on to the mark itself', () => {
    expect(pickLogoColor(ios('#FFFFFF', '#EC3750'))).toBe('#EC3750');
  });

  it('accepts a dark neutral logo rather than inventing a colour', () => {
    expect(pickLogoColor(ios('#FAFAFA', '#1A1A1A', '#F0F0F0', '#FFFFFF'))).toBe('#1A1A1A');
  });

  it('falls back to the Wallet pass red for an all-white logo', () => {
    expect(pickLogoColor(ios('#FFFFFF', '#FEFEFE', '#F5F5F5', '#FFFFFF'))).toBe(WALLET_PASS_RED);
  });

  it('reads Android results by their dominant colour first', () => {
    expect(pickLogoColor({
      platform: 'android',
      dominant: '#33D6A6',
      average: '#777777',
      vibrant: '#FF8C37',
      darkVibrant: '#000000',
      lightVibrant: '#FFFFFF',
      darkMuted: '#000000',
      lightMuted: '#FFFFFF',
      muted: '#888888',
    })).toBe('#33D6A6');
  });

  it('falls back when there is no result or it is malformed', () => {
    expect(pickLogoColor(null)).toBe(WALLET_PASS_RED);
    expect(pickLogoColor(ios('not a colour', 'rgb(1,2,3)', '', '#12'))).toBe(WALLET_PASS_RED);
  });
});

describe('passColorsFor', () => {
  it('puts white type on a dark fill', () => {
    expect(passColorsFor(WALLET_PASS_RED).foreground).toBe('#FFFFFF');
  });

  it('puts dark type on a light fill', () => {
    expect(passColorsFor('#F1C40F').foreground).toBe('#0F172A');
  });
});
