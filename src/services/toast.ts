/**
 * A short notice that floats over the app for a few seconds and goes, for
 * something that doesn't need a tap ("You're offline"). ToastHost shows it.
 * A newer toast replaces the one showing.
 */
export interface Toast {
  id: number;
  message: string;
  /** Space to leave at the bottom, over the safe area: the tab bar's height. */
  bottomOffset: number;
}

const TOAST_MS = 3500;

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Toast | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

export const toast = {
  show(message: string, options: { bottomOffset?: number } = {}) {
    if (timer) clearTimeout(timer);
    set({ id: nextId++, message, bottomOffset: options.bottomOffset ?? 0 });
    timer = setTimeout(() => {
      timer = null;
      set(null);
    }, TOAST_MS);
  },
  hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    set(null);
  },
  get(): Toast | null {
    return current;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
