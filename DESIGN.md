---
name: Attend Mobile
description: Hack Club's adaptive event-operations interface for fast, safe, server-confirmed attendance.
colors:
  hack-club-red: "#EC3750"
  signal-orange: "#FF8C37"
  signal-yellow: "#F1C40F"
  signal-green: "#33D6A6"
  info-blue: "#338EDA"
  purple: "#A633D6"
  teal: "#14B8A6"
  white: "#FFFFFF"
  shadow-ink: "#1F2D3D"
  gray-50: "#F8FAFC"
  gray-100: "#F1F5F9"
  gray-200: "#E2E8F0"
  gray-300: "#CBD5E1"
  gray-400: "#94A3B8"
  gray-600: "#475569"
  gray-700: "#334155"
  gray-800: "#1E293B"
  gray-900: "#0F172A"
  scanner-panel: "rgba(15, 23, 42, 0.97)"
  scanner-control: "rgba(15, 23, 42, 0.90)"
  scanner-border: "rgba(255, 255, 255, 0.22)"
typography:
  display:
    fontFamily: "system-ui"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "system-ui"
    fontSize: "25px"
    fontWeight: 800
    lineHeight: 1.16
    letterSpacing: "-0.5px"
  title:
    fontFamily: "system-ui"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.24
    letterSpacing: "-0.35px"
  body:
    fontFamily: "system-ui"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.44
  action:
    fontFamily: "system-ui"
    fontSize: "16px"
    fontWeight: 700
  label:
    fontFamily: "system-ui"
    fontSize: "13px"
    fontWeight: 700
rounded:
  compact: "6px"
  small: "10px"
  control: "12px"
  input: "13px"
  control-large: "14px"
  outcome: "15px"
  menu: "16px"
  kiosk-result: "22px"
  result: "24px"
  sheet: "26px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  control: "14px"
  lg: "16px"
  panel: "18px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.hack-club-red}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  scanner-tool:
    backgroundColor: "{colors.scanner-control}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control-large}"
    padding: "0 10px"
    height: "50px"
  scanner-result:
    backgroundColor: "{colors.scanner-panel}"
    textColor: "{colors.white}"
    rounded: "{rounded.result}"
    padding: "18px"
  outcome-confirming:
    backgroundColor: "{colors.info-blue}"
    textColor: "{colors.gray-900}"
    rounded: "{rounded.outcome}"
    padding: "0 11px"
    height: "30px"
  outcome-scanned:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.gray-900}"
    rounded: "{rounded.outcome}"
    padding: "0 11px"
    height: "30px"
  outcome-already-scanned:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.gray-900}"
    rounded: "{rounded.outcome}"
    padding: "0 11px"
    height: "30px"
  outcome-not-scanned:
    backgroundColor: "{colors.hack-club-red}"
    textColor: "{colors.gray-900}"
    rounded: "{rounded.outcome}"
    padding: "0 11px"
    height: "30px"
  scanner-input:
    backgroundColor: "{colors.gray-800}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: "0 15px"
    height: "52px"
---

# Design System: Attend Mobile

## Overview

**Creative North Star: "The Hack Club Field Desk"**

Attend inherits Hack Club's confident, youthful visual identity and applies it to serious live-event operations. The visual world is direct rather than institutional: bright brand and signal colors, sturdy rounded controls, strong system typography, friendly identity imagery, and plain-language outcomes.

Ordinary product screens use cool paper backgrounds, white or lightly translucent cards, and slate text. Scanner and kiosk surfaces move into a near-black camera-overlay world where contrast, identity, and outcome outrank decoration. This is one system with two environmental treatments, not separate brands.

**Key Characteristics:**

- Hack Club red for brand presence and decisive primary actions.
- Cool slate neutrals, generous rounded shapes, and native system type.
- Full-bleed camera surfaces with compact, translucent operational controls.
- Identity-first scan results whose meaning survives noise, glare, and time pressure.
- Calm density: only information that changes the operator's next action is prominent.

## Colors

The palette combines Hack Club's saturated colors with a cool slate foundation. Frontmatter tokens are normative; semantic use is fixed as follows.

### Primary

- **Hack Club Red:** Brand anchor, primary buttons, selected states, and destructive or failed outcomes. When red means failure, pair it with the `Not Scanned` label and close-circle icon so its role is unambiguous.

### Secondary

- **Signal Green:** Confirmed `Scanned`, live readiness, and positive completion.
- **Signal Orange:** `Already Scanned`, warnings, and high-support attention.
- **Info Blue:** `Confirming`, neutral information, and refrigeration notices.
- **Signal Yellow:** Medical caution and the active Power Mode control.

Purple and teal remain available Hack Club accents, but do not enter scanner outcome semantics.

### Neutral

- **Paper and White:** Default app backgrounds and cards away from the camera.
- **Gray 900 and Scanner Panel:** Camera-stage foundations and persistent result cards.
- **Gray 100–400:** Inverse secondary copy, dividers, metadata, placeholders, and quiet prompts.
- **Gray 600–800:** Dark fields, secondary controls, pressed states, and structural borders.

**The Red Is Brand and Failure Rule.** Never let red's dual role stand alone; location, copy, and iconography must state whether it is an action, selection, or failed scan.

**The Redundant Status Rule.** Every scanner outcome uses a stable label, icon, color, sound, and haptic pattern. Color is reinforcement, never the sole signal.

## Typography

**Display and Body Font:** Native system sans serif, resolving to San Francisco on Apple platforms and Roboto on Android.

**Character:** Heavy titles and result names feel confident and immediate; supporting text stays compact, calm, and native. There is no separate decorative display face.

### Hierarchy

- **Display** (700, 32, 40 line height): Kiosk's single large instruction.
- **Headline** (800, 25, 29 line height): Participant identity on scanner results; allow two lines before reducing prominence.
- **Title** (800, 21, 26 line height): Event and sheet headings.
- **Body** (400, 16, 23 line height): Explanations, field values, and permission states.
- **Action** (700–800, 16–17): Primary buttons and high-confidence actions.
- **Label** (600–800, 13–15): Outcome pills, context, metadata, tool labels, and readiness copy.

**The Identity Leads Rule.** On a known participant result, the participant name is the largest text. Outcome, context, message, and readiness follow in that order.

Use native font scaling. Avoid fixed-height text containers around names and outcomes; wrapping is preferable to truncating operational meaning.

## Layout

Base screens use 16-point horizontal gutters and cards; focused setup flows expand to 24 points. Scanner surfaces use 18-point header and stage gutters, a 14-point bottom dock, and 8–16-point gaps between related controls. Safe-area insets always contain controls while the camera may extend edge to edge.

The staff scanner is vertically zoned: event/readiness header, context selector, flexible scan stage, persistent result card, then scan tools. The camera remains visible beneath three scrim zones: a darker top band for navigation, a light middle band around the code, and a darker bottom band for results and tools. A visible result never blocks the next different scan.

Scanner controls, menus, result cards, and sheets are centered and capped at 620 points; sheets cap at 680. The QR frame scales to the smallest of 66% viewport width, 39% viewport height, 300 points on phones, or 420 points on iPad. Kiosk mode uses 55% of the viewport's shorter dimension and keeps its prompt centered above the frame.

On larger devices, add breathing room without stretching the operational column. iPad may expose kiosk entry, and landscape iPad layouts may use split-view patterns elsewhere, but scanner hierarchy and control order stay unchanged. Preserve iOS edge gestures, Android Back behavior outside locked kiosk mode, and platform window insets.

**The Continuous Stage Rule.** Do not replace the camera with a result page or require dismissal. Results occupy the bottom dock and the live frame stays ready.

## Elevation & Depth

Default app surfaces use restrained card depth: a white or translucent surface, a faint border, and a soft low shadow. Camera surfaces use tonal scrims and stronger elevation so controls survive visually noisy footage. Result cards use a 12-point downward offset, roughly 24-point blur, 0.25–0.30 opacity, and Android elevation 12. Context menus may rise to elevation 16. Hairline white borders define dark translucent controls without making them glass ornaments.

**The Camera Contrast Rule.** Elevation on camera surfaces exists for legibility and layer order. Do not add blur, glow, or decorative transparency that weakens text or scanning visibility.

## Shapes

Attend uses friendly, substantial rounding. Compact badges may use 6–10-point corners; inputs and operational buttons use 12–14; menus and ordinary cards use 16; scanner result cards use 22–24; bottom sheets use 26-point top corners. Status chips and small action capsules are fully pill-shaped.

Participant photos are circular with a two-point translucent white rim. Initials fallbacks occupy the exact same circle and never cause layout shift. QR targeting is represented by four independent white corner brackets, not a closed decorative frame.

**The One Radius per Object Rule.** Preserve the established radius by component role. Do not mix multiple corner treatments within one card or invent sharp-edged variants for scanner controls.

## Components

### Buttons and Controls

- **Primary:** Hack Club red, white bold text, 48–52-point minimum height, and a 12–14-point radius.
- **Scanner tools:** Near-black translucent fill, hairline white border, white icon and label, equal flexible widths, and a 50-point minimum height.
- **Pressed:** Reduce opacity to 0.72 or move the dark surface one neutral step lighter. Disabled controls reduce opacity to 0.45–0.50 but retain readable labels.
- **Power Mode:** At rest it matches scanner tools. Active state switches to signal yellow with gray-900 icon and text.
- **Icons:** Use Ionicons at 16–24 points. Pair unfamiliar or operational icons with text.

### Scanner Result Card

The card is the scanner's signature component: a persistent near-black identity panel over the live camera. Its hierarchy does not move between outcomes:

1. Circular participant photo or initials fallback.
2. Outcome pill, participant name, and optional pronouns.
3. Scan context and server-confirmation detail.
4. Actionable message when present.
5. Minimum role-permitted safety alerts.
6. Readiness reminder, Retry when valid, and Details when identity is known.

There is no close button and no success claim before server confirmation. A different scan replaces the card immediately. `Retry` appears only for a retryable `Not Scanned` result; `Details` appears only when a participant is known.

### Outcome States

- **Confirming:** Blue sync icon and `Confirming`; no success language, sound, or outcome haptic. The supporting prompt is `Hold steady`.
- **Scanned:** Green check-circle and `Scanned`; success sound and success haptic.
- **Already Scanned:** Orange time icon and `Already Scanned`; neutral double cue and warning haptic. Show first-scan time when available.
- **Not Scanned:** Red close-circle and `Not Scanned`; rejection cue and error haptic. Explain that no attendance change was confirmed and offer Retry only when the same attempt can be retried.

Final outcomes announce as assertive live-region alerts; confirming is a polite summary. Feedback playback is asynchronous and non-fatal, and it never delays the next scan.

### Safety Alerts

Safety alerts are compact dark-surface pills with an icon, direct label, and semantic color: red for anaphylaxis risk, blue for medication refrigeration, and orange for high support. Show only the minimum information permitted for the signed-in role; never expose medical or safeguarding detail merely because the scanner has space.

### Inputs and Sheets

Manual ID and search use bottom sheets over a darkened backdrop. Sheets use a gray-900 surface, 26-point top corners, a clear 44-point close target, 52-point dark fields, and a red primary submit action. Search results use hairline separators and a green `Scan` affordance. Keyboard avoidance and native dismissal behavior are mandatory.

### Kiosk

Kiosk keeps the camera and scan brackets dominant, with one large attendee-facing prompt and a compact bottom result. It reuses the exact scanner outcome labels, colors, avatar, sounds, and haptics. Staff-only unlock UI moves to a centered white modal with biometrics or a four-digit PIN; the locked screen's hidden exit target still exposes an accessibility label.

### Motion and Feedback

Motion is short and functional. Participant images crossfade in over 120 ms and become instant when Reduce Motion is enabled. Modals may fade; scanner results replace without a blocking entrance sequence. If result-card movement is added, reduced-motion mode must use a crossfade or instant replacement. Device volume, audio policy, and accessibility preferences remain authoritative.

### Accessibility

Use at least 44×44 points on iOS and 48×48 dp on Android. Preserve readable contrast over live video, Dynamic Type/font scaling, explicit accessibility labels and states, native focus order, and safe areas. Critical meaning must remain available through copy and iconography when sound, haptics, color perception, or motion is unavailable.

## Do's and Don'ts

### Do:

- **Do** preserve Hack Club red, the cool slate neutral scale, native system type, and the existing Hack Club flag and event assets.
- **Do** keep scan copy context-neutral: `Scanned`, `Already Scanned`, and `Not Scanned`.
- **Do** make identity and authoritative outcome understandable in a glance, screen-reader announcement, sound cue, and haptic pattern.
- **Do** keep the live camera mounted and controls within safe areas while results update in the bottom dock.
- **Do** use cached imagery for speed, with an initials fallback that preserves size and hierarchy.

### Don't:

- **Don't** use `Checked In` as the generic scanner outcome; scan contexts also represent exits, pickups, and other checkpoints.
- **Don't** use green or success language while a server confirmation is pending or unavailable.
- **Don't** require operators to dismiss a result before scanning another attendee.
- **Don't** let translucent camera UI become low-contrast glassmorphism or let tablet layouts stretch past the 620-point operational column.
- **Don't** reveal sensitive participant data beyond the minimum role-scoped safety alert needed at the checkpoint.
