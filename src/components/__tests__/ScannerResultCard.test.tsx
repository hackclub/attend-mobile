import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Participant } from '../../types';
import type { ScannerResult, ScannerOutcome } from '../../services/scannerCore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Animated: {
    View: 'AnimatedView',
    Value: class {
      setValue = jest.fn();
    },
    timing: () => ({ start: (cb?: () => void) => cb?.() }),
    spring: () => ({ start: (cb?: () => void) => cb?.() }),
  },
  PanResponder: {
    create: jest.fn((handlers: { onPanResponderRelease: (...args: unknown[]) => void }) => ({
      panHandlers: { onResponderRelease: handlers.onPanResponderRelease },
    })),
  },
  Platform: { OS: 'ios' },
  useColorScheme: () => 'light',
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    announceForAccessibility: jest.fn(),
  },
}));

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
// The kit's controls render as host elements carrying their props.
jest.mock('../ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  StatusGlyph: 'StatusGlyph',
}));

import { ScannerResultCard } from '../ScannerResultCard';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    participant_id: 'person-1',
    participant_event_id: 'registration-1',
    display_name: 'Alex Rivera',
    full_name: 'Alex Rivera',
    email: 'alex@example.com',
    pronouns: 'they/them',
    status: 'complete',
    has_anaphylaxis_risk: false,
    requires_refrigeration: false,
    cross_contamination_risk: false,
    freedom_waiver_granted: false,
    high_support_flag: false,
    can_leave_unaccompanied: false,
    waiver_signed: true,
    ...overrides,
  };
}

function result(outcome: ScannerOutcome, overrides: Partial<ScannerResult> = {}): ScannerResult {
  return {
    attemptId: 'attempt-1',
    rawData: 'raw-code',
    source: 'qr',
    outcome,
    participant: participant(),
    scanContext: {
      id: 'context-1',
      name: 'Main entrance',
      checks_in: true,
      is_airport: false,
    },
    retryable: false,
    ...overrides,
  };
}

async function renderCard(
  scanResult: ScannerResult,
  callbacks: { onClear?: jest.Mock; onDetails?: jest.Mock | null; onUndo?: jest.Mock } = {}
) {
  let tree!: renderer.ReactTestRenderer;
  const onDetails = callbacks.onDetails === null
    ? undefined
    : callbacks.onDetails ?? jest.fn();
  await act(() => {
    tree = renderer.create(
      <ScannerResultCard
        result={scanResult}
        onDetails={onDetails}
        onRetry={jest.fn()}
        onClear={callbacks.onClear ?? jest.fn()}
        onUndo={callbacks.onUndo}
        progress="85 of 129"
      />
    );
  });
  return tree;
}

describe('ScannerResultCard', () => {
  it.each([
    ['confirming', 'Confirming'],
    ['scanned', 'Scanned'],
    ['already_scanned', 'Already Scanned'],
    ['not_scanned', 'Not Scanned'],
  ] as const)('renders the %s outcome in direct language', async (outcome, label) => {
    const tree = await renderCard(result(outcome));
    expect(JSON.stringify(tree.toJSON())).toContain(label);
  });

  it('renders a queued scan as saved offline, never as scanned', async () => {
    const tree = await renderCard(result('queued', {
      message: 'Will sync when back online',
    }));
    const json = JSON.stringify(tree.toJSON());

    expect(json).toContain('Saved offline');
    expect(json).toContain('Will sync when back online');
    expect(json).not.toContain('"Scanned"');
    expect(json).not.toContain('#33D6A6');
  });

  it('labels a queued scan of an unidentified attendee in the compact card', async () => {
    const tree = await renderCard(result('queued', {
      participant: undefined,
      message: 'Will sync when back online',
    }));

    expect(JSON.stringify(tree.toJSON())).toContain('Saved offline. Will sync when back online');
  });

  it('drops the details action when the role cannot open participant records', async () => {
    const tree = await renderCard(result('scanned'), { onDetails: null });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Details');
  });

  it('renders the cached headshot, context, and a details action without a dismiss control', async () => {
    const tree = await renderCard(result('scanned', {
      participant: participant({ headshot_url: 'https://images.example/headshot' }),
    }));

    expect(tree.root.findByProps({ accessibilityLabel: 'Photo of Alex Rivera' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('Main entrance');
    expect(tree.root.findByProps({ accessibilityLabel: 'View Alex Rivera details' })).toBeTruthy();
    expect(() => tree.root.findByProps({ accessibilityLabel: 'Dismiss result' })).toThrow();
  });

  it('shows initials when no headshot exists', async () => {
    const tree = await renderCard(result('scanned', {
      participant: participant({ headshot_url: null }),
    }));

    expect(JSON.stringify(tree.toJSON())).toContain('AR');
  });

  it('does not truncate the attendee name and clears on a downward swipe', async () => {
    const onClear = jest.fn();
    const tree = await renderCard(result('scanned'), { onClear });
    const name = tree.root.findAllByType(Text)
      .find(node => node.props.children === 'Alex Rivera');

    expect(name?.props.numberOfLines).toBeUndefined();
    const card = tree.root.findAll(node => !!node.props.onResponderRelease)[0];
    card?.props.onResponderRelease({}, { dy: 80, vy: 0.8 });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('only navigates to the record via the details button, not the card body', async () => {
    const onDetails = jest.fn();
    const tree = await renderCard(result('scanned'), { onDetails });

    const swipeSurfaces = tree.root.findAll(node => !!node.props.onResponderRelease);
    swipeSurfaces.forEach(surface => expect(surface.props.onPress).toBeUndefined());

    const detailsButton = tree.root.findByProps({ accessibilityLabel: 'View Alex Rivera details' });
    detailsButton.props.onPress();
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it('surfaces minimum safety alerts without hiding identity', async () => {
    const tree = await renderCard(result('scanned', {
      participant: participant({
        has_anaphylaxis_risk: true,
        requires_refrigeration: true,
        high_support_flag: true,
      }),
    }));
    const json = JSON.stringify(tree.toJSON());

    expect(json).toContain('Anaphylaxis');
    expect(json).toContain('Medication refrigeration');
    expect(json).toContain('High support');
    expect(json).toContain('Alex Rivera');
  });

  it('renders a compact card when no attendee is identified', async () => {
    const tree = await renderCard(result('not_scanned', {
      participant: undefined,
      message: 'Unrecognised QR code',
    }));
    const json = JSON.stringify(tree.toJSON());

    expect(json).toContain('Unrecognised QR code');
    expect(json).not.toContain('Attendee not identified');
    expect(json).not.toContain('Ready for next attendee');
    expect(json).not.toContain('Main entrance');
  });

  it('compact card clears on a downward swipe from the handle', async () => {
    const onClear = jest.fn();
    const tree = await renderCard(
      result('not_scanned', { participant: undefined, message: 'Unrecognised QR code' }),
      { onClear }
    );
    const swipeTargets = tree.root.findAll(node => !!node.props.onResponderRelease);

    expect(swipeTargets.length).toBeGreaterThan(0);
    swipeTargets[0].props.onResponderRelease({}, { dy: 80, vy: 0.8 });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('offers retry only for retryable failures', async () => {
    const retryable = await renderCard(result('not_scanned', {
      retryable: true,
      message: 'Could not reach Attend. Try again.',
    }));
    const finalFailure = await renderCard(result('not_scanned', {
      attemptId: 'attempt-2',
      retryable: false,
      message: 'Participant not found.',
    }));

    expect(retryable.root.findByProps({ accessibilityLabel: 'Try the scan again' })).toBeTruthy();
    expect(() => finalFailure.root.findByProps({ accessibilityLabel: 'Try the scan again' })).toThrow();
  });

  it('offers undo only for a fresh scan', async () => {
    const onUndo = jest.fn();
    const fresh = await renderCard(result('scanned'), { onUndo });
    fresh.root.findByProps({ accessibilityLabel: "Undo Alex Rivera's scan" }).props.onPress();
    expect(onUndo).toHaveBeenCalledTimes(1);

    for (const outcome of ['already_scanned', 'queued', 'confirming', 'not_scanned'] as const) {
      const tree = await renderCard(result(outcome, { attemptId: outcome }), { onUndo });
      expect(() => tree.root.findByProps({ accessibilityLabel: "Undo Alex Rivera's scan" })).toThrow();
    }
  });

  it('shows the context and its progress on the status line', async () => {
    const tree = await renderCard(result('scanned'));
    expect(JSON.stringify(tree.toJSON())).toContain(' · Main entrance · 85 of 129');
  });
});
