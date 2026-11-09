import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
}));
jest.mock('../../../theme', () => ({
  useTheme: () => ({ tokens: { accent: 'accent', text: 'text', div2: 'div2' } }),
}));
jest.mock('../../../components/ui', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const Stub = (props: Record<string, unknown>) => createElement('Stub', props);
  return { Icon: Stub, ListRow: Stub, PressableSurface: Stub, Sheet: Stub, SHEET_INSET: 16 };
});
const mockOnSelect = jest.fn();
jest.mock('../useSheetData', () => ({
  useSheetData: () => ({
    title: 'Pick',
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    selected: null,
    onSelect: mockOnSelect,
  }),
}));

import { OptionsSheet } from '../OptionsSheet';

it('only takes the first choice when tapped twice', async () => {
  let root: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    root = renderer.create(<OptionsSheet />);
  });
  const rows = root!.root.findAll(node => node.props.title === 'A' || node.props.title === 'B')
    .filter(node => typeof node.props.onPress === 'function');
  act(() => {
    rows[0].props.onPress();
    rows[1].props.onPress();
  });
  expect(mockOnSelect).toHaveBeenCalledTimes(1);
  expect(mockOnSelect).toHaveBeenCalledWith('a');
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
