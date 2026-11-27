import { holdKioskLock, isKioskLocked } from '../kioskLock';

describe('kioskLock', () => {
  it('is locked while any kiosk holds it', () => {
    expect(isKioskLocked()).toBe(false);
    const releaseA = holdKioskLock();
    const releaseB = holdKioskLock();
    expect(isKioskLocked()).toBe(true);
    releaseA();
    expect(isKioskLocked()).toBe(true);
    releaseB();
    expect(isKioskLocked()).toBe(false);
  });

  it('ignores a repeated release', () => {
    const releaseA = holdKioskLock();
    const releaseB = holdKioskLock();
    releaseA();
    releaseA();
    expect(isKioskLocked()).toBe(true);
    releaseB();
    expect(isKioskLocked()).toBe(false);
  });
});
