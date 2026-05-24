import { useWindowDimensions, Platform } from 'react-native';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isPad: boolean;
  isLandscape: boolean;
  useSplitView: boolean;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isPad = Platform.OS === 'ios' && Platform.isPad === true;
  const isLandscape = width > height;
  const useSplitView = isPad && isLandscape && width >= 900;
  return { width, height, isPad, isLandscape, useSplitView };
}
