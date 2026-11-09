import { createSheetStack } from '../sheetStack';

describe('createSheetStack', () => {
  it('opens sheets over each other, in order', () => {
    const stack = createSheetStack();
    stack.open('FilterSheet');
    stack.open('OptionsSheet');
    expect(stack.get().map((sheet) => sheet.name)).toEqual(['FilterSheet', 'OptionsSheet']);
  });

  it('does not open a sheet twice', () => {
    const stack = createSheetStack();
    stack.open('AccountSheet');
    const before = stack.get();
    stack.open('AccountSheet');
    expect(stack.get()).toBe(before);
  });

  it('gives each opening its own id', () => {
    const stack = createSheetStack();
    stack.open('LinkSheet');
    const first = stack.get()[0].id;
    stack.remove(first);
    stack.open('LinkSheet');
    expect(stack.get()[0].id).not.toBe(first);
  });

  it('removes only the sheet asked for', () => {
    const stack = createSheetStack();
    stack.open('FilterSheet');
    stack.open('OptionsSheet');
    stack.remove(stack.get()[0].id);
    expect(stack.get().map((sheet) => sheet.name)).toEqual(['OptionsSheet']);
  });

  it('notifies on changes only', () => {
    const stack = createSheetStack();
    const listener = jest.fn();
    const unsubscribe = stack.subscribe(listener);
    stack.open('LinkSheet');
    stack.open('LinkSheet');
    stack.remove(999);
    expect(listener).toHaveBeenCalledTimes(1);
    stack.clear();
    stack.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    stack.open('LinkSheet');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
