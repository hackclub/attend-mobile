# Continuous scanner design

## Status

Approved in conversation on 2026-08-24. This design spans the Expo mobile app in this repository and the Rails API in `/Users/leo/Code/attend`.

## Context

The current scanner pauses camera handling while its result overlay is visible, retains the result for up to 30 seconds, and requires manual dismissal before another QR code can be processed. It performs linear participant lookups, loads scan contexts from the network, and does not persist confirmed scan responses into the participant cache. The UI does not show the participant headshot and has haptics but no audible feedback.

Context attendance can also be wrong across devices. The mobile app treats its cached `scans_by_context` data as authoritative and skips the API call when it finds a match. When it does call Rails, it treats any successful HTTP response as a new scan even when `first_scan_in_context` is false. Rails checks for an existing context scan and creates the next scan without locking the participant-event, so concurrent devices can both decide they recorded the first scan. The scan response omits the cached roster's `headshot_url`, `checked_in_at`, and `scans_by_context` fields, and the mobile reducer replaces the richer cached participant with this partial payload.

## Goals

- Keep the camera active and accept the next different QR code without dismissing the current result.
- Show cached identity, including the participant headshot, as soon as a code is recognized.
- Present only server-confirmed mutation outcomes as successful.
- Return exactly one `scanned` outcome for the first scan in a participant/context pair, even under concurrent requests from different users or devices.
- Preserve every intentional repeat attempt as scan history and return `already_scanned` for repeats.
- Add distinct, preloaded sound and haptic feedback for `scanned`, `already scanned`, and `not scanned` outcomes.
- Warm participant, context, and image caches so the critical scan path does not wait on roster or image fetches.
- Offer a per-device power mode that keeps the scanner awake and dims it after inactivity without allowing auto-lock.
- Preserve QR, NFC, search, and manual-ID entry paths through one result model.

## Non-goals

- Do not add offline-success semantics. A network failure is `not scanned`, and the operator must retry after reconnecting.
- Do not replace the app's navigation or Hack Club visual identity.
- Do not add a general settings system or a global terminology migration.
- Do not remove scan-attempt history or enforce one database row per participant/context pair.
- Do not require Action Cable for correctness. Real-time push can be added later without changing the scan command contract.

## Chosen architecture

Use a hybrid cached-read, authoritative-write flow.

The mobile app maintains an indexed, persistent event roster and displays cached identity immediately. Every scan mutation still goes to Rails. Rails serializes competing requests for one participant-event, records each attempt, classifies it atomically, and returns the authoritative outcome plus the data needed to reconcile the mobile cache. Incremental participant refresh keeps passive state reasonably fresh across devices, but no local cache decision can override the result of a scan command.

The additive Rails response ships before the mobile client. Older mobile versions continue reading `first_scan_in_context`; the new client prefers the explicit `outcome` field and falls back to the existing boolean during rollout.

## Scan command contract

### Request

`POST /api/v1/events/:event_id/scans` continues accepting a participant identifier or NFC badge token and adds consistent use of:

- `scan_context_id`
- `scanned_at`
- `client_scan_id`, generated once per recognized attempt and reused for transport retries
- `source`, one of `qr`, `nfc`, or `manual`

### Atomic classification

Rails resolves the participant-event, then performs the existing-context check and scan creation while holding a row lock on that participant-event.

- If no earlier scan exists for the selected context, create the attempt and return `outcome: "scanned"`.
- If an earlier scan exists, still create the attempt and return `outcome: "already_scanned"` with the earliest scan time.
- Exactly one of two concurrent first attempts can return `scanned`; both rows remain in scan history.
- A retry with the same `client_scan_id` returns the original scan and the same semantic outcome without creating another row.

Scan deletion and creation use the same participant-event lock so their final ordering is deterministic.

### Response

The response remains backward compatible and adds:

```json
{
  "success": true,
  "outcome": "scanned",
  "first_scan_in_context": true,
  "first_scanned_at": "2026-08-24T09:41:00Z",
  "scan": {},
  "scan_context": {},
  "participant": {}
}
```

The participant payload used by this endpoint must include or preserve the mobile roster fields required by the result card and cache reconciliation: identifiers, display name, pronouns, `headshot_url`, `checked_in_at`, safety flags allowed for the current role, and `scans_by_context`. The mobile merge is field-preserving so an additive or temporarily partial server payload cannot erase already cached detail.

Scan creation and destruction update the parent participant-event timestamp. The participant index endpoint's existing `updated_since` support can then deliver scan-derived state changes, including undo operations.

## Mobile scan state machine

The scanner uses one explicit state machine rather than coordinating `isProcessing`, `showResult`, two last-scanned refs, and a 30-second timer independently.

States:

- `idle`
- `confirming`, with cached participant data when available
- `scanned`
- `already_scanned`
- `not_scanned`

Each recognized attempt has its own identifier. Only one authoritative scan request runs at a time, so audio and visible outcomes cannot arrive out of order. Barcode callbacks are suppressed during the brief `confirming` request, then re-enabled immediately when it settles. A visible completed result never blocks scanning.

The camera remains mounted and barcode handling remains enabled while a result card is visible. A different QR code replaces the visible card immediately. Repeated camera frames for the same code are suppressed for a short interval. Network failures expose a direct retry action using the same attempt data rather than requiring the operator to hold the code in frame again.

The scan command does not consult cached context membership to decide whether to skip the server. Cached membership can inform the confirming UI, but Rails owns the final classification.

QR, NFC, search, and manual-ID paths call the same scan command and produce the same result type. NFC reading remains platform-specific, but classification and feedback are shared.

## Scanner interface

The approved result treatment is a persistent identity card anchored over the live camera. It has no close button and never pauses scanning.

The card hierarchy is stable across outcomes:

1. Participant photo or accessible initials fallback.
2. Display name and pronouns when present.
3. Outcome label.
4. Scan context and server-confirmation detail.
5. Minimum necessary safety alerts for the signed-in role.
6. `View details` action when a participant is known.
7. A quiet reminder that the next scan replaces the card.

Outcome language is context-neutral:

- `Scanned`
- `Already Scanned`
- `Not Scanned`

The app does not use `Checked In` on this scanner result card because contexts may represent entering, leaving, airport pickup, or another checkpoint.

Color reinforces but does not carry meaning. Success uses the existing green role, already-scanned uses orange, and failure uses red. Each state also has distinct copy, iconography, sound, and haptics. Tapping the card opens full participant details; swiping it down clears it. Neither action is required before scanning again.

## Sound and haptics

Audio assets are short, original bundled cues loaded before the scanner becomes interactive:

- `Scanned`: short rising two-note cue and success haptic.
- `Already Scanned`: quiet neutral double cue and warning haptic.
- `Not Scanned`: short low rejection cue and error haptic.

Playback must not delay the result state or the next scan. Audio failures are non-fatal. Device volume and platform audio policy remain authoritative; meaning never depends on sound alone.

## Data and image caching

### Participant cache

Hydrate cached participants immediately when an event is selected, then refresh in the background. Build in-memory maps keyed by participant-event id, participant id, and NFC token so identity resolution is constant-time. Confirmed scan responses are merged into both the in-memory index and Async Storage.

Track the participant endpoint's `synced_at` cursor per event. Background refresh requests `updated_since`, merges changed participants, and advances the cursor only after persistence succeeds. Scan create and destroy touch the participant-event so cross-device changes appear in this feed.

### Context cache

Cache scan contexts per event. Render the cached context selection immediately, revalidate in the background, and preserve the selected context when it remains valid. A removed or invalid context forces a clear selection rather than silently scanning elsewhere.

### Headshot cache

Render headshots through a native image component with memory and disk caching. After roster hydration, prefetch headshots in the background with bounded concurrency so image work cannot starve scan API requests. A failed or absent image falls back to initials without layout shift. Logout clears roster data and the app's image disk cache so one staff session cannot expose another session's cached participant photos.

## Power mode

Expose a per-device scanner option named `Power Mode`, default off and remembered locally.

When enabled while the scanner is focused:

- prevent device auto-lock;
- remember the current app brightness;
- after 30 seconds without a scan or touch, lower brightness to the lesser of the current level and 20%;
- restore the remembered brightness immediately on touch or QR recognition;
- display a compact active indicator in the scanner toolbar.

Leaving the scanner, backgrounding the app, disabling Power Mode, signing out, or unmounting after an error always restores the previous brightness and releases the keep-awake lock. The lifecycle cleanup is idempotent so crashes or repeated focus events cannot progressively alter brightness.

## Error handling

- Invalid QR: `Not Scanned`, explain that the code is not an Attend participant code.
- Participant absent from the event: `Not Scanned`, preserve the raw identifier only for retry and diagnostics.
- Network unavailable or timeout: `Not Scanned`, state that no attendance change was confirmed, and offer retry.
- Server validation or context error: `Not Scanned`, show the actionable server message without exposing implementation detail.
- Cached participant missing: show `Confirming…` without identity, then populate the authoritative participant response.
- Headshot failure: retain the card with initials fallback.
- Audio or haptic failure: retain visual feedback and continue scanning.

No network error is queued as a successful scan. Existing legacy pending-scan storage can remain for backward compatibility, but the new scanner does not add to it.

## Accessibility and platform behavior

- Use a minimum 44-point iOS and 48-dp Android touch target.
- Keep outcome meaning redundant across copy, icon, color, sound, and haptics.
- Preserve Dynamic Type/font scaling without truncating the attendee name or outcome.
- Honor reduced-motion settings by using a crossfade instead of card translation.
- Keep iOS safe areas, Android window insets, system Back, and navigation gestures intact.
- Do not expose medical or safeguarding detail beyond what the existing signed-in role may view.

## Testing strategy

### Rails request and model tests

- First attempt returns `scanned` and records one row.
- Later same-context attempt returns `already_scanned`, reports the first time, and records another row.
- Two concurrent requests create two history rows but produce exactly one `scanned` outcome.
- The same participant in two contexts can produce one `scanned` outcome per context.
- Reusing a `client_scan_id` is idempotent and returns the original outcome.
- Scan and undo operations serialize under the participant-event lock.
- Response includes the mobile identity and context fields.
- Create and destroy update the participant-event timestamp for incremental sync.

### Mobile unit and component tests

- QR parsing and the context-neutral scan-result mapping.
- A visible result does not block a different QR code.
- Repeated frames of the same QR are suppressed.
- A completed result re-enables scanning immediately while an in-flight authoritative request remains serialized.
- A cached participant is merged rather than replaced by a partial response.
- `first_scan_in_context: false` maps to `Already Scanned` during rollout fallback.
- Network failure maps to `Not Scanned` and creates no pending-success record.
- Participant indexes and incremental cache merges preserve all identifier paths.
- Headshot failure renders initials.
- Each outcome requests the correct audio and haptic cue without awaiting playback.
- Power Mode restores brightness and keep-awake state on every focus, background, disable, and unmount path.

### Manual verification

- Scan alternating attendees continuously on iPhone and Android without dismissing cards.
- Scan the same attendee/context from two physical devices at nearly the same time.
- Verify QR, NFC, participant search, and manual ID produce matching cards.
- Verify headshots render immediately after warm-cache launch and fall back cleanly when absent.
- Verify all three cues in a noisy room and with sound unavailable.
- Verify Power Mode dims after inactivity, wakes on recognition, and restores device behavior on every exit path.
- Verify phone and iPad layouts, light/dark platform behavior where applicable, large text, reduced motion, and camera permission states.

## Rollout and compatibility

1. Deploy the additive Rails response and atomic classification first.
2. Release the mobile client with explicit outcome handling and fallback to `first_scan_in_context`.
3. Monitor scan errors, response latency, and duplicate client IDs through existing logging and Sentry.
4. Remove obsolete mobile overlay and offline-success paths only after the new scanner tests pass.

The database continues storing every scan attempt. No destructive migration is required.
