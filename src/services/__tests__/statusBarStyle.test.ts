jest.mock('react-native', () => ({
  StatusBar: {
    pushStackEntry: jest.fn((props: object) => ({ ...props })),
    replaceStackEntry: jest.fn((_entry: object, props: object) => ({ ...props })),
    popStackEntry: jest.fn(),
  },
}));

import { StatusBar } from 'react-native';
import { statusBarStyleEntry } from '../statusBarStyle';

const push = StatusBar.pushStackEntry as jest.Mock;
const replace = StatusBar.replaceStackEntry as jest.Mock;
const pop = StatusBar.popStackEntry as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('statusBarStyleEntry', () => {
  it('pushes once, then replaces in place', () => {
    const entry = statusBarStyleEntry();
    entry.set('light');
    expect(push).toHaveBeenCalledWith({ barStyle: 'light-content' });
    entry.set('dark');
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(expect.anything(), { barStyle: 'dark-content' });
    entry.clear();
  });

  it('leaves the stack alone for the style it already shows', () => {
    const entry = statusBarStyleEntry();
    entry.set('light');
    entry.set('light');
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    entry.clear();
  });

  it('pops on clear, and goes back on top when set again', () => {
    const entry = statusBarStyleEntry();
    entry.set('light');
    entry.clear();
    entry.clear();
    expect(pop).toHaveBeenCalledTimes(1);
    entry.set('light');
    expect(push).toHaveBeenCalledTimes(2);
    entry.clear();
  });
});
