import React from 'react';
import {
  FilterChip as ComposeFilterChip,
  Icon as ComposeIcon,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import type { FilterChipProps } from './FilterChip';
import { MaterialHost } from './MaterialHost';

const CHECK_ICON = require('../../../assets/material/check.xml');

/**
 * Android: Material 3's filter chip (Jetpack Compose) in the app's theme, with
 * the tick it shows when selected. TalkBack reads it with its selected state.
 * See FilterChip.tsx for iOS.
 */
export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <MaterialHost matchContents>
      <ComposeFilterChip
        selected={selected}
        onClick={onPress}
      >
        <ComposeFilterChip.Label>
          <ComposeText maxLines={1}>{label}</ComposeText>
        </ComposeFilterChip.Label>
        {selected ? (
          <ComposeFilterChip.LeadingIcon>
            <ComposeIcon source={CHECK_ICON} size={18} />
          </ComposeFilterChip.LeadingIcon>
        ) : null}
      </ComposeFilterChip>
    </MaterialHost>
  );
}
