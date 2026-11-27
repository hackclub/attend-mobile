import type { SheetRouteName } from './sheets';

/** One open sheet: which drawer, and an id that tells two openings apart. */
export interface OpenSheet {
  id: number;
  name: SheetRouteName;
}

/**
 * The drawers open on Android, bottom first. There a drawer is a Material
 * ModalBottomSheet mounted by SheetHost rather than a route, so this stands
 * in for the root stack's sheet routes (see navigation/sheetPresenter).
 * On iOS it stays empty.
 */
export interface SheetStack {
  /** Opens `name` over the others; a no-op if it's already open. */
  open(name: SheetRouteName): void;
  /** Forgets a sheet once it has gone (dismissed, or hidden after a close). */
  remove(id: number): void;
  /** Forgets every sheet at once, e.g. on sign-out. */
  clear(): void;
  get(): readonly OpenSheet[];
  subscribe(listener: () => void): () => void;
}

export function createSheetStack(): SheetStack {
  let sheets: readonly OpenSheet[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const set = (next: readonly OpenSheet[]) => {
    if (next === sheets) return;
    sheets = next;
    listeners.forEach((listener) => listener());
  };

  return {
    open(name) {
      if (sheets.some((sheet) => sheet.name === name)) return;
      set([...sheets, { id: nextId++, name }]);
    },
    remove(id) {
      if (!sheets.some((sheet) => sheet.id === id)) return;
      set(sheets.filter((sheet) => sheet.id !== id));
    },
    clear() {
      if (sheets.length) set([]);
    },
    get: () => sheets,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app's drawers (Android only; always empty on iOS). */
export const sheetStack = createSheetStack();
