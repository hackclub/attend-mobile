import React from 'react';
import { ActivityIndicator } from 'react-native';

export interface SpinnerProps {
  /** 'small' is 20, 'large' 36, as the platform spinners. */
  size?: 'small' | 'large';
  color: string;
  /** Spoken while loading; defaults to the platform's own. */
  accessibilityLabel?: string;
  /**
   * Inside a control that already says it's busy, e.g. a loading button
   * (Android; iOS's spinner is left as it was).
   */
  decorative?: boolean;
}

/**
 * An indeterminate spinner: UIActivityIndicatorView on iOS (Material 3's
 * circular progress indicator on Android: Spinner.android.tsx).
 */
export function Spinner({ size = 'small', color, accessibilityLabel }: SpinnerProps) {
  return <ActivityIndicator size={size} color={color} accessibilityLabel={accessibilityLabel} />;
}
