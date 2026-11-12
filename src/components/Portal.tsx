import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';

// Content drawn over the whole app, in its own window: a full-screen view
// that would otherwise be a Modal (a separate window, which screen recorders
// on Android miss and gesture handling has to be set up in again). The host
// sits at the app root, inside the providers; one portal at a time.

let content: ReactNode = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const get = () => content;

/** Renders the open portal's content, over everything else. */
export function PortalHost() {
  return useSyncExternalStore(subscribe, get, get);
}

/** Draws `children` over the whole app while mounted. */
export function Portal({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    content = children;
    emit();
  }, [children]);
  useLayoutEffect(
    () => () => {
      content = null;
      emit();
    },
    []
  );
  return null;
}
