import { materialColorOverrides } from '../materialColors';
import { darkTokens, lightTokens } from '../tokens';

describe('materialColorOverrides', () => {
  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ])('gives Compose plain hex colours in %s', (_scheme, tokens) => {
    for (const color of Object.values(materialColorOverrides(tokens))) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
    }
  });

  it('tints controls with the accent and follows the scheme', () => {
    expect(materialColorOverrides(lightTokens).primary).toBe(lightTokens.accent);
    expect(materialColorOverrides(darkTokens).primary).toBe(darkTokens.accent);
    expect(materialColorOverrides(darkTokens).surface).toBe(darkTokens.bg);
  });
});
