import React, { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ActionMenu, Button, OverlayIconButton, type MenuAction } from './ui';
import { overlayTokens, radii } from '../theme';

// The scanner's controls over the camera, apart from the camera so the dev
// gallery can show them without one.

/** The square the camera reads codes in: four corners, or none. */
export function ScanFrame({
  size,
  corners = true,
  processing = false,
  accessibilityLabel,
}: {
  size: number;
  /** Off until a context is chosen: the reason takes the frame's place. */
  corners?: boolean;
  processing?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={accessibilityLabel}>
      {corners ? (
        <>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </>
      ) : null}
      {processing ? (
        <View style={styles.processing}>
          <ActivityIndicator color={overlayTokens.on} size="small" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The scanner's bottom row, centred: the torch, the ⋯ menu (power mode,
 * kiosk mode) and Search, `[torch][⋯][  Search  ]`, all in thumb reach.
 */
export function ScannerDock({
  torchOn,
  onTorch,
  menuActions,
  searchTitle,
  searchDisabled,
  onSearch,
  trailing,
}: {
  torchOn: boolean;
  onTorch: () => void;
  menuActions: MenuAction[];
  searchTitle: string;
  searchDisabled?: boolean;
  onSearch: () => void;
  /** After Search, e.g. iOS's NFC button. */
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.dock}>
      <OverlayIconButton
        surface="camera"
        icon="torch"
        accessibilityLabel={torchOn ? 'Turn torch off' : 'Turn torch on'}
        active={torchOn}
        onPress={onTorch}
      />
      <ActionMenu
        // The camera is dark whatever the theme.
        colorScheme="dark"
        feedbackColor={overlayTokens.on}
        accessibilityLabel="More: Power mode, Kiosk mode"
        actions={menuActions}
      >
        <OverlayIconButton surface="camera" icon="overflow" accessibilityLabel="More" />
      </ActionMenu>
      <Button
        variant="primary"
        icon="search"
        title={searchTitle}
        disabled={searchDisabled}
        onPress={onSearch}
        style={styles.search}
      />
      {trailing}
    </View>
  );
}

const CORNER = { size: 44, thickness: 5, radius: 20 };

const styles = StyleSheet.create({
  dock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  search: { flexGrow: 1, flexShrink: 1, maxWidth: 220 },
  corner: { position: 'absolute', width: CORNER.size, height: CORNER.size, borderColor: overlayTokens.scanFrame },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER.thickness, borderLeftWidth: CORNER.thickness, borderTopLeftRadius: CORNER.radius },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER.thickness, borderRightWidth: CORNER.thickness, borderTopRightRadius: CORNER.radius },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER.thickness, borderLeftWidth: CORNER.thickness, borderBottomLeftRadius: CORNER.radius },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER.thickness, borderRightWidth: CORNER.thickness, borderBottomRightRadius: CORNER.radius },
  processing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: overlayTokens.cameraControl,
  },
});
