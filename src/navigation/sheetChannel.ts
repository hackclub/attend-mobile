import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Hands a sheet route its data and callbacks, which don't belong in route
 * params (they aren't serialisable, and some are large, like the roster).
 *
 * The screen that opens a sheet calls `useOpener(data)` on every render and
 * `claim()` just before navigating to the sheet. From then on the sheet
 * reads that opener's latest data with `useData()`, so it stays live (e.g.
 * the selection updating as the user ticks rows), until another opener
 * claims the channel or the opener unmounts, when the sheet gets
 * `undefined` and should close.
 */
export interface SheetChannel<T> {
  /** Opener side. Returns `claim`. */
  useOpener(data: T): () => void;
  /** Sheet side: the claiming opener's latest data. */
  useData(): T | undefined;
  /** The current data, outside React. */
  get(): T | undefined;
}

export function createSheetChannel<T>(): SheetChannel<T> {
  let current: { owner: object; data: T } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => current?.data;

  return {
    get,
    useData() {
      return useSyncExternalStore(subscribe, get, get);
    },
    useOpener(data: T) {
      const [owner] = useState(() => ({}));
      const dataRef = useRef(data);
      useLayoutEffect(() => {
        dataRef.current = data;
        if (current?.owner === owner && current.data !== data) {
          current = { owner, data };
          emit();
        }
      });
      useEffect(
        () => () => {
          if (current?.owner === owner) {
            current = null;
            emit();
          }
        },
        [owner]
      );
      return useCallback(() => {
        current = { owner, data: dataRef.current };
        emit();
      }, [owner]);
    },
  };
}
