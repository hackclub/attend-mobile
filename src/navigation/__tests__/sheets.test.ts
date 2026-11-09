import { composeSheetHeight, isRouteUnderSheets, isSheetRoute } from '../sheets';

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
    expect(isSheetRoute('SwitchEventSheet')).toBe(true);
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

describe('composeSheetHeight', () => {
  it('fits content when the form sheet does', () => {
    expect(composeSheetHeight('fitToContents')).toBe('fit');
    expect(composeSheetHeight(undefined)).toBe('fit');
    expect(composeSheetHeight([])).toBe('fit');
  });

  it('takes the largest detent', () => {
    expect(composeSheetHeight([0.9])).toBe(0.9);
    expect(composeSheetHeight([0.5, 0.95])).toBe(0.95);
  });

  it('never exceeds the screen', () => {
    expect(composeSheetHeight([1.2])).toBe(1);
  });
});
