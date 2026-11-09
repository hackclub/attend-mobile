/** Sign-out confirmation copy, with a stronger warning when scans would be lost. */
export function signOutConfirmation(unsentScans: number): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  if (unsentScans > 0) {
    const scans = unsentScans === 1 ? '1 scan' : `${unsentScans} scans`;
    return {
      title: 'Unsynced scans',
      message: `${scans} ${unsentScans === 1 ? "hasn't" : "haven't"} synced yet and will be lost if you sign out. Connect to the internet and sync first to keep ${unsentScans === 1 ? 'it' : 'them'}.`,
      confirmLabel: `Discard ${scans} and sign out`,
    };
  }
  return {
    title: 'Sign out',
    message: 'Are you sure you want to sign out?',
    confirmLabel: 'Sign out',
  };
}
