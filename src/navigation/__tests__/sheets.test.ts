import { isRouteUnderSheets, isSheetRoute } from '../sheets';

const main = (tab: string, stackTop: string) => ({
  key: 'main',
  name: 'Main',
  state: {
    index: 0,
    routes: [
      {
        key: `${tab}-tab`,
        name: tab,
        state: { index: 0, routes: [{ key: stackTop, name: stackTop }] },
      },
    ],
  },
});

describe('isSheetRoute', () => {
  it('knows the form sheets', () => {
    expect(isSheetRoute('ScanContextSheet')).toBe(true);
    expect(isSheetRoute('Kiosk')).toBe(false);
  });
});

describe('isRouteUnderSheets', () => {
  it('is false with no sheet open', () => {
    expect(isRouteUnderSheets({ index: 0, routes: [main('Scanner', 'scan')] }, 'scan')).toBe(false);
  });

  it('is true for the screen under one or more sheets', () => {
    const state = {
      index: 2,
      routes: [
        main('Scanner', 'scan'),
        { key: 's1', name: 'ScannerSearchSheet' },
        { key: 's2', name: 'OptionsSheet' },
      ],
    };
    expect(isRouteUnderSheets(state, 'scan')).toBe(true);
  });

  it('is false when the screen under the sheet is another one', () => {
    const state = { index: 1, routes: [main('Overview', 'home'), { key: 's', name: 'AccountSheet' }] };
    expect(isRouteUnderSheets(state, 'scan')).toBe(false);
  });

  it('is false under a full-screen route', () => {
    const state = {
      index: 2,
      routes: [main('Scanner', 'scan'), { key: 'k', name: 'KioskSetup' }, { key: 's', name: 'OptionsSheet' }],
    };
    expect(isRouteUnderSheets(state, 'scan')).toBe(false);
  });
});
