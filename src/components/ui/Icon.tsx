import React from 'react';
import Svg, { Circle, Path, type SvgProps } from 'react-native-svg';
// One module per glyph: the package's barrel would pull in every icon.
import BanIcon from 'react-native-heroicons/outline/BanIcon';
import BellIcon from 'react-native-heroicons/outline/BellIcon';
import CalendarIcon from 'react-native-heroicons/outline/CalendarIcon';
import CameraIcon from 'react-native-heroicons/outline/CameraIcon';
import ChatIcon from 'react-native-heroicons/outline/ChatIcon';
import CheckCircleIcon from 'react-native-heroicons/outline/CheckCircleIcon';
import CheckIcon from 'react-native-heroicons/outline/CheckIcon';
import ChevronDownIcon from 'react-native-heroicons/outline/ChevronDownIcon';
import ChevronLeftIcon from 'react-native-heroicons/outline/ChevronLeftIcon';
import ChevronRightIcon from 'react-native-heroicons/outline/ChevronRightIcon';
import ChevronUpIcon from 'react-native-heroicons/outline/ChevronUpIcon';
import ClipboardListIcon from 'react-native-heroicons/outline/ClipboardListIcon';
import ClockIcon from 'react-native-heroicons/outline/ClockIcon';
import CogIcon from 'react-native-heroicons/outline/CogIcon';
import DeviceMobileIcon from 'react-native-heroicons/outline/DeviceMobileIcon';
import DotsHorizontalIcon from 'react-native-heroicons/outline/DotsHorizontalIcon';
import ExclamationCircleIcon from 'react-native-heroicons/outline/ExclamationCircleIcon';
import ExclamationIcon from 'react-native-heroicons/outline/ExclamationIcon';
import ExternalLinkIcon from 'react-native-heroicons/outline/ExternalLinkIcon';
import FilterIcon from 'react-native-heroicons/outline/FilterIcon';
import HomeIcon from 'react-native-heroicons/outline/HomeIcon';
import IdentificationIcon from 'react-native-heroicons/outline/IdentificationIcon';
import InboxIcon from 'react-native-heroicons/outline/InboxIcon';
import InformationCircleIcon from 'react-native-heroicons/outline/InformationCircleIcon';
import LocationMarkerIcon from 'react-native-heroicons/outline/LocationMarkerIcon';
import LockClosedIcon from 'react-native-heroicons/outline/LockClosedIcon';
import LogoutIcon from 'react-native-heroicons/outline/LogoutIcon';
import MailIcon from 'react-native-heroicons/outline/MailIcon';
import PaperAirplaneIcon from 'react-native-heroicons/outline/PaperAirplaneIcon';
import PencilIcon from 'react-native-heroicons/outline/PencilIcon';
import PlusIcon from 'react-native-heroicons/outline/PlusIcon';
import QrcodeIcon from 'react-native-heroicons/outline/QrcodeIcon';
import RefreshIcon from 'react-native-heroicons/outline/RefreshIcon';
import SearchIcon from 'react-native-heroicons/outline/SearchIcon';
import ShieldExclamationIcon from 'react-native-heroicons/outline/ShieldExclamationIcon';
import TicketIcon from 'react-native-heroicons/outline/TicketIcon';
import TrashIcon from 'react-native-heroicons/outline/TrashIcon';
import UserCircleIcon from 'react-native-heroicons/outline/UserCircleIcon';
import UserGroupIcon from 'react-native-heroicons/outline/UserGroupIcon';
import UsersIcon from 'react-native-heroicons/outline/UsersIcon';
import WifiIcon from 'react-native-heroicons/outline/WifiIcon';
import XCircleIcon from 'react-native-heroicons/outline/XCircleIcon';
import XIcon from 'react-native-heroicons/outline/XIcon';
import { useTheme } from '../../theme';

// Heroicons v1 outline (what the Attend admin uses), all at stroke 2 on a
// 24px grid. Screens ask for icons by meaning, not by glyph, so swapping a
// glyph later is a one-line change here.

type IconComponent = (props: SvgProps & { size?: number | string }) => React.JSX.Element;

// Custom glyphs Heroicons v1 lacks, drawn in the same 24px / stroke-2 style.
const custom = (children: React.ReactNode): IconComponent =>
  function CustomIcon({ size = 24, ...props }) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {children}
      </Svg>
    );
  };

const TorchIcon = custom(
  <>
    <Path d="M7 3h10v3l-2 4v10a1 1 0 01-1 1h-4a1 1 0 01-1-1V10L7 6V3z" />
    <Path d="M7 6h10" />
    <Path d="M12 13v2" />
  </>,
);

const NfcIcon = custom(
  <>
    <Path d="M6 8.5a7.5 7.5 0 010 7" />
    <Path d="M9.5 6.2a11.8 11.8 0 010 11.6" />
    <Path d="M13 4a16 16 0 010 16" />
    <Path d="M16.5 2a20 20 0 010 20" />
  </>,
);

const CameraFlipIcon = custom(
  <>
    <Path d="M11 19H5a2 2 0 01-2-2V8a2 2 0 012-2h1.5l1.5-2h3" />
    <Path d="M13 4h3l1.5 2H19a2 2 0 012 2v9a2 2 0 01-2 2h-3" />
    <Circle cx={12} cy={12.5} r={3} />
    <Path d="M15 21l-2-2 2-2" />
    <Path d="M9 2l2 2-2 2" />
  </>,
);

export const icons = {
  overview: HomeIcon,
  home: HomeIcon,
  scan: QrcodeIcon,
  qrcode: QrcodeIcon,
  people: UsersIcon,
  users: UsersIcon,
  'user-group': UserGroupIcon,
  travel: PaperAirplaneIcon,
  search: SearchIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-up': ChevronUpIcon,
  'chevron-down': ChevronDownIcon,
  x: XIcon,
  close: XIcon,
  'x-circle': XCircleIcon,
  check: CheckIcon,
  'check-circle': CheckCircleIcon,
  exclamation: ExclamationIcon,
  'exclamation-circle': ExclamationCircleIcon,
  'information-circle': InformationCircleIcon,
  'lock-closed': LockClosedIcon,
  'external-link': ExternalLinkIcon,
  mail: MailIcon,
  inbox: InboxIcon,
  chat: ChatIcon,
  'shield-exclamation': ShieldExclamationIcon,
  incident: ShieldExclamationIcon,
  bell: BellIcon,
  cog: CogIcon,
  settings: CogIcon,
  'user-circle': UserCircleIcon,
  account: UserCircleIcon,
  logout: LogoutIcon,
  refresh: RefreshIcon,
  clock: ClockIcon,
  location: LocationMarkerIcon,
  ticket: TicketIcon,
  calendar: CalendarIcon,
  trash: TrashIcon,
  plus: PlusIcon,
  pencil: PencilIcon,
  'dots-horizontal': DotsHorizontalIcon,
  more: DotsHorizontalIcon,
  filter: FilterIcon,
  camera: CameraIcon,
  'device-mobile': DeviceMobileIcon,
  identification: IdentificationIcon,
  wifi: WifiIcon,
  ban: BanIcon,
  'clipboard-list': ClipboardListIcon,
  torch: TorchIcon,
  flashlight: TorchIcon,
  nfc: NfcIcon,
  'camera-flip': CameraFlipIcon,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  /** Rendered size in points. Defaults to 20 (16 inside buttons and statuses). */
  size?: number;
  /** Stroke colour. Defaults to the body text colour. */
  color?: string;
  /** Visual weight; the design system uses 2 everywhere. */
  strokeWidth?: number;
  /** Set to describe a standalone, meaningful icon. Decorative icons stay hidden. */
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({ name, size = 20, color, strokeWidth = 2, accessibilityLabel, testID }: IconProps) {
  const { tokens } = useTheme();
  const Glyph = icons[name] as IconComponent;
  const decorative = !accessibilityLabel;
  return (
    <Glyph
      size={size}
      color={color ?? tokens.text}
      stroke={color ?? tokens.text}
      strokeWidth={strokeWidth}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      testID={testID}
    />
  );
}
