import { signOutConfirmation } from '../signOutConfirmation';

describe('signOutConfirmation', () => {
  it('is the plain confirmation when nothing is waiting to sync', () => {
    expect(signOutConfirmation(0)).toEqual({
      title: 'Sign out',
      message: 'Are you sure you want to sign out?',
      confirmLabel: 'Sign out',
    });
  });

  it('warns that unsent scans will be lost and names the count in the destructive button', () => {
    const copy = signOutConfirmation(3);
    expect(copy.message).toMatch(/^3 scans haven't synced yet and will be lost/);
    expect(copy.confirmLabel).toBe('Discard 3 scans and sign out');
  });

  it('uses the singular for one scan', () => {
    const copy = signOutConfirmation(1);
    expect(copy.message).toMatch(/^1 scan hasn't synced yet/);
    expect(copy.confirmLabel).toBe('Discard 1 scan and sign out');
  });
});
