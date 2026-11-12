import React, { useMemo } from 'react';
import { Host, type HostProps } from '@expo/ui/jetpack-compose';
import { useTheme } from '../../theme';
import { materialColorOverrides } from '../../theme/materialColors';

/**
 * A Jetpack Compose host (Android only: import it from `*.android.tsx` files)
 * themed with the app's light/dark scheme and brand colours, so Material 3
 * controls inside it match the rest of the app.
 */
export function MaterialHost(props: Omit<HostProps, 'colorScheme' | 'seedColor' | 'colorOverrides'>) {
  const { scheme, tokens } = useTheme();
  const colorOverrides = useMemo(() => materialColorOverrides(tokens), [tokens]);
  return <Host {...props} colorScheme={scheme} seedColor={tokens.brand} colorOverrides={colorOverrides} />;
}
