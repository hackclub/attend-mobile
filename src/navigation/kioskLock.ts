// While kiosk mode is on screen, nothing from outside the app may navigate:
// a deep link, a Live Activity tap, a push tap or a home screen shortcut
// would otherwise land on a route under the kiosk modal, dismissing it with
// no PIN and handing the device to whoever is at the desk. Guided Access
// (iOS) and screen pinning (Android) are optional, so this can't rely on them.

let activeKiosks = 0;

/** Marks kiosk mode as on screen; call the returned function when it leaves. */
export function holdKioskLock(): () => void {
  activeKiosks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeKiosks -= 1;
  };
}

/** Whether kiosk mode is on screen, so outside navigation must be ignored. */
export function isKioskLocked(): boolean {
  return activeKiosks > 0;
}
