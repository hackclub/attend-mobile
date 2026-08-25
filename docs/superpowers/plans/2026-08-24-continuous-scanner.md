# Continuous Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a continuous, cached scanner that shows attendee identity immediately, records server-authoritative context outcomes across devices, provides sound and haptic feedback, and offers an idle-dimming keep-awake mode.

**Architecture:** Rails records every attempt through a participant-event row lock and returns `scanned` or `already_scanned` atomically. The Expo app uses persistent roster and image caches for identity, but every mutation waits for the server before showing success. Scanner behavior is split into pure state and cache helpers, native lifecycle adapters, and a focused result-card component.

**Tech Stack:** Rails 8.1, PostgreSQL row locks, RSpec, Expo SDK 54, React Native 0.81, TypeScript, Jest, Async Storage, `expo-image`, `expo-audio`, `expo-brightness`, `expo-keep-awake`, and `expo-haptics`.

**Spec:** `docs/superpowers/specs/2026-08-24-continuous-scanner-design.md`

## Global Constraints

- Scanner result copy is exactly `Scanned`, `Already Scanned`, and `Not Scanned`.
- Every scan attempt is retained in Rails history; only transport retries sharing one `client_scan_id` deduplicate.
- A network failure is never stored or displayed as a successful offline scan.
- Rails is authoritative for context membership across devices.
- The result card never blocks a later different QR code after the current authoritative request settles.
- Power Mode defaults off, keeps the device awake, dims after 30 seconds to at most 20%, and restores platform state on every exit path.
- Critical outcomes never depend on color or sound alone.
- Preserve Hack Club identity, existing role-scoped sensitive-data rules, native safe areas, system Back behavior, and reduced-motion behavior.
- Deploy the additive Rails contract before releasing the mobile client.

## File map

### Rails repository: `/Users/leo/Code/attend`

- `app/services/scan_recorder.rb`: atomically classify, record, and deduplicate scan attempts.
- `app/models/scan.rb`: touch the participant-event when scan-derived state changes.
- `app/controllers/api/v1/scans_controller.rb`: resolve inputs, call `ScanRecorder`, serialize the outcome and mobile participant summary, and lock deletions.
- `spec/services/scan_recorder_spec.rb`: service behavior, idempotency, per-context classification, and concurrency.
- `spec/requests/api/v1/scans_spec.rb`: response contract, enriched participant payload, and deletion behavior.

### Mobile repository: `/Users/leo/.bb/worktrees/env_496p3eue92/attend-mobile`

- `src/types/index.ts`: scan outcomes, scan response, participant-sync page, and cached context types.
- `src/services/api.ts`: additive scan request and participant-delta API contract.
- `src/services/storage.ts`: participant cursor, context cache, and Power Mode keys.
- `src/services/sync.ts`: full and incremental participant merges, confirmed participant persistence, and context caching.
- `src/services/participantIndex.ts`: constant-time participant resolution and field-preserving merges.
- `src/services/scannerCore.ts`: QR parsing, same-frame suppression, server outcome mapping, and immutable scan-result construction.
- `src/services/scanFeedback.ts`: pure outcome-to-sound/haptic mapping.
- `src/hooks/useScanFeedback.ts`: lifecycle-managed audio players and non-blocking haptic playback.
- `src/services/scannerPower.ts`: testable idle timer and brightness/keep-awake controller.
- `src/hooks/useScannerPowerMode.ts`: focus, AppState, persistence, and native adapters for Power Mode.
- `src/services/headshotCache.ts`: bounded prefetch and logout cache clearing.
- `src/hooks/useScanner.ts`: one serialized authoritative request and shared QR/NFC/manual result flow.
- `src/components/ParticipantAvatar.tsx`: cached headshot with stable initials fallback.
- `src/components/ScannerResultCard.tsx`: persistent non-blocking identity and outcome card.
- `src/screens/ScannerScreen.tsx`: camera composition, context selector, Power Mode control, result replacement, retry, and details navigation.
- `src/context/AppContext.tsx`: field-preserving participant updates and persistent confirmed-cache writes.
- `assets/sounds/scanned.wav`, `assets/sounds/already-scanned.wav`, `assets/sounds/not-scanned.wav`: original short feedback cues.
- `src/services/__tests__/api.test.ts`, `sync.test.ts`, `participantIndex.test.ts`, `scannerCore.test.ts`, `scanFeedback.test.ts`, `scannerPower.test.ts`, and `headshotCache.test.ts`: behavior coverage.
- `src/components/__tests__/ScannerResultCard.test.tsx`: outcome copy, identity, alert, action, and fallback rendering.

---

### Task 1: Make Rails scan recording atomic and idempotent

**Files:**
- Create: `/Users/leo/Code/attend/spec/services/scan_recorder_spec.rb`
- Create: `/Users/leo/Code/attend/app/services/scan_recorder.rb`
- Modify: `/Users/leo/Code/attend/app/models/scan.rb:4`

**Interfaces:**
- Consumes: `ParticipantEvent`, `User`, `ScanContext`, `scanned_at`, `client_scan_id`, and `source`.
- Produces: `ScanRecorder.call(...) -> ScanRecorder::Result`, with `scan`, `outcome`, `first_scanned_at`, and `first_scan_in_context?`.

- [ ] **Step 1: Write the failing service examples**

```ruby
RSpec.describe ScanRecorder do
  subject(:record) do
    described_class.call(
      participant_event: participant_event,
      user: user,
      scan_context: context,
      scanned_at: Time.zone.parse("2026-08-24 09:41:00"),
      client_scan_id: client_scan_id,
      source: "qr"
    )
  end

  let(:participant_event) { create(:participant_event) }
  let(:context) { participant_event.event.scan_contexts.find_by!(checks_in: true) }
  let(:user) { create(:user) }
  let(:client_scan_id) { SecureRandom.uuid }

  it "classifies the first context attempt as scanned" do
    expect(record.outcome).to eq("scanned")
    expect(record.first_scan_in_context?).to be(true)
    expect(record.first_scanned_at).to eq(record.scan.scanned_at)
  end

  it "records and classifies a later context attempt" do
    first = record
    second = described_class.call(
      participant_event: participant_event,
      user: user,
      scan_context: context,
      scanned_at: 1.minute.from_now,
      client_scan_id: SecureRandom.uuid,
      source: "qr"
    )
    expect(second.outcome).to eq("already_scanned")
    expect(second.first_scanned_at).to eq(first.scan.scanned_at)
    expect(participant_event.scans.where(scan_context: context).count).to eq(2)
  end

  it "returns the original result for a transport retry" do
    first = record
    retry_result = described_class.call(
      participant_event: participant_event,
      user: user,
      scan_context: context,
      scanned_at: 2.minutes.from_now,
      client_scan_id: client_scan_id,
      source: "qr"
    )
    expect(retry_result.scan.id).to eq(first.scan.id)
    expect(participant_event.scans.count).to eq(1)
  end
end
```

- [ ] **Step 2: Run the service spec and verify red**

Run: `bundle exec rspec spec/services/scan_recorder_spec.rb`

Expected: FAIL with `uninitialized constant ScanRecorder`.

- [ ] **Step 3: Implement the recorder under a participant-event row lock**

```ruby
class ScanRecorder
  Result = Data.define(:scan, :outcome, :first_scanned_at) do
    def first_scan_in_context?
      outcome == "scanned"
    end
  end

  def self.call(**attributes)
    new(**attributes).call
  end

  def initialize(participant_event:, user:, scan_context:, scanned_at:, client_scan_id:, source:)
    @participant_event = participant_event
    @user = user
    @scan_context = scan_context
    @scanned_at = scanned_at
    @client_scan_id = client_scan_id.presence
    @source = source
  end

  def call
    participant_event.with_lock do
      existing_retry = participant_event.scans.find_by(client_scan_id: client_scan_id) if client_scan_id
      return result_for(existing_retry) if existing_retry

      first_scan = context_scans.order(:created_at, :id).first
      scan = participant_event.scans.create!(
        user: user,
        scan_context: scan_context,
        scanned_at: scanned_at,
        client_scan_id: client_scan_id,
        source: source
      )
      Result.new(
        scan: scan,
        outcome: first_scan ? "already_scanned" : "scanned",
        first_scanned_at: first_scan&.scanned_at || scan.scanned_at
      )
    end
  rescue ActiveRecord::RecordNotUnique
    retry_scan = participant_event.scans.find_by!(client_scan_id: client_scan_id)
    result_for(retry_scan)
  end

  private

  attr_reader :participant_event, :user, :scan_context, :scanned_at, :client_scan_id, :source

  def context_scans
    participant_event.scans.where(scan_context: scan_context)
  end

  def result_for(scan)
    first_scan = participant_event.scans.where(scan_context: scan.scan_context).order(:created_at, :id).first!
    Result.new(
      scan: scan,
      outcome: first_scan.id == scan.id ? "scanned" : "already_scanned",
      first_scanned_at: first_scan.scanned_at
    )
  end
end
```

Change the model association to `belongs_to :participant_event, touch: true` so create and destroy both advance `participant_events.updated_at`.

- [ ] **Step 4: Add and run the concurrency example**

Use records created in `before(:context)` so both database connections can see committed setup. Gate two service calls with queues and clean the isolated records in `after(:context)`:

```ruby
context "with concurrent attempts" do
  before(:context) do
    @concurrent_participant_event = FactoryBot.create(:participant_event)
    @concurrent_context = @concurrent_participant_event.event.scan_contexts.find_by!(checks_in: true)
    @concurrent_user = FactoryBot.create(:user)
  end

  after(:context) do
    @concurrent_participant_event.destroy!
    @concurrent_user.destroy!
  end

  it "classifies exactly one attempt as the first scan" do
    ready = Queue.new
    release = Queue.new
    results = Queue.new
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          release.pop
          results << described_class.call(
            participant_event: @concurrent_participant_event,
            user: @concurrent_user,
            scan_context: @concurrent_context,
            scanned_at: Time.current,
            client_scan_id: SecureRandom.uuid,
            source: "qr"
          )
        end
      end
    end

    2.times { ready.pop }
    2.times { release << true }
    threads.each(&:join)

    outcomes = 2.times.map { results.pop.outcome }
    expect(outcomes.sort).to eq(%w[already_scanned scanned])
    expect(@concurrent_participant_event.scans.where(scan_context: @concurrent_context).count).to eq(2)
  end
end
```

Run: `bundle exec rspec spec/services/scan_recorder_spec.rb`

Expected: PASS with one `scanned`, one `already_scanned`, and two scan rows.

- [ ] **Step 5: Commit the Rails service**

```bash
git add app/services/scan_recorder.rb app/models/scan.rb spec/services/scan_recorder_spec.rb
git commit -m "fix: serialize scan outcomes by context"
```

### Task 2: Return the authoritative Rails scan contract

**Files:**
- Modify: `/Users/leo/Code/attend/spec/requests/api/v1/scans_spec.rb`
- Modify: `/Users/leo/Code/attend/app/controllers/api/v1/scans_controller.rb`

**Interfaces:**
- Consumes: `ScanRecorder::Result` from Task 1.
- Produces: additive JSON fields `outcome`, `first_scanned_at`, `scan_context`, and a mobile-safe participant snapshot.

- [ ] **Step 1: Write failing request specs for the additive response**

```ruby
it "returns a context-neutral authoritative outcome and identity snapshot" do
  participant_event = create(:participant_event, event: event)
  context = event.scan_contexts.find_by!(checks_in: true)

  post "/api/v1/events/#{event.id}/scans",
    params: {
      participant_id: participant_event.id,
      scan_context_id: context.id,
      client_scan_id: SecureRandom.uuid,
      scanned_at: Time.current.iso8601
    },
    headers: auth_headers

  expect(response).to have_http_status(:ok)
  json = response.parsed_body
  expect(json.slice("outcome", "first_scan_in_context")).to eq(
    "outcome" => "scanned",
    "first_scan_in_context" => true
  )
  expect(json["first_scanned_at"]).to be_present
  expect(json["scan_context"]["id"]).to eq(context.id)
  expect(json["participant"]).to include(
    "participant_event_id" => participant_event.id,
    "headshot_url" => nil,
    "scans_by_context" => [a_hash_including("scan_context_id" => context.id, "scan_count" => 1)]
  )
end
```

Add examples for a repeat returning `already_scanned`, the same `client_scan_id` returning one row, and DELETE advancing `participant_event.updated_at`.

- [ ] **Step 2: Run request specs and verify red**

Run: `bundle exec rspec spec/requests/api/v1/scans_spec.rb`

Expected: FAIL because `outcome`, `first_scanned_at`, top-level `scan_context`, and the enriched participant fields are absent.

- [ ] **Step 3: Route create through `ScanRecorder`**

Move the idempotency lookup until after participant resolution, call `ScanRecorder`, and render:

```ruby
result = ScanRecorder.call(
  participant_event: participant_event,
  user: current_user,
  scan_context: scan_context,
  scanned_at: params[:scanned_at].presence || Time.current,
  client_scan_id: params[:client_scan_id],
  source: scan_source
)

render json: {
  success: true,
  outcome: result.outcome,
  first_scan_in_context: result.first_scan_in_context?,
  first_scanned_at: result.first_scanned_at.iso8601,
  scan: scan_json(result.scan),
  scan_context: scan_context_json(scan_context),
  participant: participant_detail_json(participant_event.reload)
}
```

Retain airport pickup and NFC token side effects only when `result.first_scan_in_context?` is true.

- [ ] **Step 4: Expand and lock the remaining controller paths**

Add `headshot_url`, `checked_in_at`, and `scans_by_context` to `participant_detail_json`. Use the same shapes as `ParticipantsController#headshot_url_for` and `#scans_by_context_json`. Wrap DELETE selection and destruction in `participant_event.with_lock`.

- [ ] **Step 5: Run focused and full Rails verification**

Run: `bundle exec rspec spec/services/scan_recorder_spec.rb spec/requests/api/v1/scans_spec.rb`

Expected: PASS.

Run: `bin/rubocop app/services/scan_recorder.rb app/models/scan.rb app/controllers/api/v1/scans_controller.rb spec/services/scan_recorder_spec.rb spec/requests/api/v1/scans_spec.rb`

Expected: no offenses.

- [ ] **Step 6: Commit the Rails contract**

```bash
git add app/controllers/api/v1/scans_controller.rb spec/requests/api/v1/scans_spec.rb
git commit -m "feat: return authoritative scan outcomes"
```

### Task 3: Add mobile API contracts and dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/types/index.ts`
- Modify: `src/services/api.ts`
- Modify: `src/services/__tests__/api.test.ts`

**Interfaces:**
- Consumes: additive Rails response from Task 2.
- Produces: `ScanOutcome`, `CreateScanResponse`, `ParticipantsSyncPage`, `api.createScan(...)`, `api.createNfcScan(...)`, and `api.getParticipants(eventId, updatedSince?)`.

- [ ] **Step 1: Install SDK-compatible native dependencies**

Run: `npx expo install expo-image expo-audio expo-brightness expo-keep-awake`

Expected: Expo selects SDK 54 compatible package versions. Do not add system brightness permissions because `setBrightnessAsync` is app/activity-scoped.

- [ ] **Step 2: Write failing API contract tests**

```typescript
it('sends scan context, source, and client id', async () => {
  mockFetch.mockResolvedValueOnce(jsonResponse({
    success: true,
    outcome: 'scanned',
    first_scan_in_context: true,
    first_scanned_at: '2026-08-24T09:41:00Z',
    scan: {},
    scan_context: { id: 'ctx-1', name: 'Exit', checks_in: false, is_airport: false },
    participant: participant,
  }));

  await api.createScan('event-1', 'participant-1', {
    scanContextId: 'ctx-1',
    clientScanId: 'attempt-1',
    source: 'qr',
    scannedAt: '2026-08-24T09:41:00Z',
  });

  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
    participant_id: 'participant-1',
    scan_context_id: 'ctx-1',
    client_scan_id: 'attempt-1',
    source: 'qr',
    scanned_at: '2026-08-24T09:41:00Z',
  });
});
```

Add a test that `getParticipants('event-1', cursor)` sends `updated_since` and returns both `participants` and `synced_at`.

- [ ] **Step 3: Run the API tests and verify red**

Run: `npm test -- --runInBand src/services/__tests__/api.test.ts`

Expected: FAIL because the option object and participant sync page do not exist.

- [ ] **Step 4: Add exact TypeScript contracts and API methods**

```typescript
export type ScanOutcome = 'scanned' | 'already_scanned';

export interface CreateScanOptions {
  scanContextId?: string;
  clientScanId: string;
  source: 'qr' | 'nfc' | 'manual';
  scannedAt: string;
}

export interface CreateScanResponse {
  success: true;
  outcome?: ScanOutcome;
  first_scan_in_context: boolean;
  first_scanned_at?: string;
  scan: RemoteScan;
  scan_context?: ScanContext;
  participant: Participant;
}

export interface ParticipantsSyncPage {
  participants: Participant[];
  synced_at: string;
}
```

Build the request body from `CreateScanOptions`. For rollout, the mobile outcome mapper uses `response.outcome ?? (response.first_scan_in_context ? 'scanned' : 'already_scanned')`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand src/services/__tests__/api.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit mobile API support**

```bash
git add package.json package-lock.json src/types/index.ts src/services/api.ts src/services/__tests__/api.test.ts
git commit -m "feat: add authoritative scan api contract"
```

### Task 4: Build indexed persistent participant and context caches

**Files:**
- Create: `src/services/participantIndex.ts`
- Create: `src/services/__tests__/participantIndex.test.ts`
- Modify: `src/services/storage.ts`
- Modify: `src/services/sync.ts`
- Modify: `src/services/__tests__/sync.test.ts`
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Consumes: `ParticipantsSyncPage` from Task 3.
- Produces: `ParticipantIndex`, `mergeParticipant`, `mergeParticipants`, `syncService.refreshParticipants`, `syncService.cacheConfirmedParticipant`, `syncService.getCachedScanContexts`, and `syncService.cacheScanContexts`.

- [ ] **Step 1: Write failing merge and index tests**

```typescript
it('preserves rich cached fields when a scan response is partial', () => {
  const cached = participant({ headshot_url: 'https://images/headshot', allergies: 'peanuts' });
  const merged = mergeParticipant(cached, {
    participant_id: cached.participant_id,
    participant_event_id: cached.participant_event_id,
    display_name: 'Updated Name',
  });
  expect(merged.headshot_url).toBe('https://images/headshot');
  expect(merged.allergies).toBe('peanuts');
  expect(merged.display_name).toBe('Updated Name');
});

it('resolves every scanner identifier in constant time', () => {
  const cached = participant({ nfc_badge_token: 'badge-1' });
  const index = new ParticipantIndex([cached]);
  expect(index.find(cached.participant_id)).toBe(cached);
  expect(index.find(cached.participant_event_id)).toBe(cached);
  expect(index.findByNfcToken('badge-1')).toBe(cached);
});
```

Add sync tests for full replacement without a cursor, delta merge with a cursor, cursor persistence after participant persistence, confirmed participant persistence, and cached contexts.

- [ ] **Step 2: Run focused cache tests and verify red**

Run: `npm test -- --runInBand src/services/__tests__/participantIndex.test.ts src/services/__tests__/sync.test.ts`

Expected: FAIL because the index and new cache methods do not exist.

- [ ] **Step 3: Implement field-preserving merges and indexes**

```typescript
export function mergeParticipant(current: Participant | undefined, incoming: Partial<Participant>): Participant {
  return { ...(current ?? {}), ...incoming } as Participant;
}

export function mergeParticipants(current: Participant[], incoming: Participant[]): Participant[] {
  const byId = new Map(current.map(item => [item.participant_event_id, item]));
  for (const item of incoming) byId.set(item.participant_event_id, mergeParticipant(byId.get(item.participant_event_id), item));
  return [...byId.values()];
}
```

`ParticipantIndex` owns three `Map` instances and exposes `find(identifier)` and `findByNfcToken(token)`.

- [ ] **Step 4: Add versioned participant and context storage**

Add keys:

```typescript
PARTICIPANT_SYNC_CURSOR: (eventId: string) => `participant_sync_cursor_${eventId}`,
SCAN_CONTEXTS: (eventId: string) => `scan_contexts_${eventId}`,
POWER_MODE_ENABLED: 'scanner_power_mode_enabled',
```

Change `refreshParticipants` to request the stored cursor, merge deltas, persist participants, then persist `synced_at`. `cacheConfirmedParticipant` performs the same field-preserving merge for one participant.

- [ ] **Step 5: Make AppContext persist confirmed updates**

Change `updateParticipant` to accept `Partial<Participant> & Pick<Participant, 'participant_event_id'>`, dispatch the merged record, and await `syncService.cacheConfirmedParticipant` through a new async `confirmParticipant` context method used by scanner mutations. Leave read-only local updates synchronous.

- [ ] **Step 6: Run cache tests and typecheck**

Run: `npm test -- --runInBand src/services/__tests__/participantIndex.test.ts src/services/__tests__/sync.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the cache layer**

```bash
git add src/services/participantIndex.ts src/services/__tests__/participantIndex.test.ts src/services/storage.ts src/services/sync.ts src/services/__tests__/sync.test.ts src/context/AppContext.tsx
git commit -m "feat: index and persist scanner data"
```

### Task 5: Replace scanner flags with one authoritative scan core

**Files:**
- Create: `src/services/scannerCore.ts`
- Create: `src/services/__tests__/scannerCore.test.ts`
- Modify: `src/hooks/useScanner.ts`

**Interfaces:**
- Consumes: `ParticipantIndex`, `CreateScanResponse`, and selected `ScanContext`.
- Produces: `ScannerResult`, `parseQRCode`, `responseOutcome`, `SameCodeGate`, `scan(data, source)`, and `retryLastScan()`.

- [ ] **Step 1: Write failing scanner-core tests**

```typescript
it('maps the rollout boolean to already scanned', () => {
  expect(responseOutcome({ first_scan_in_context: false })).toBe('already_scanned');
});

it('does not block a different code after a completed result', () => {
  const gate = new SameCodeGate(3000);
  expect(gate.accept('attendee-a', 1000)).toBe(true);
  expect(gate.accept('attendee-a', 1100)).toBe(false);
  expect(gate.accept('attendee-b', 1100)).toBe(true);
});

it('maps a network error to not scanned without an offline success', () => {
  expect(failedResult(networkError, participant).outcome).toBe('not_scanned');
  expect(failedResult(networkError, participant).retryable).toBe(true);
});
```

Cover Attend URL, legacy payload, raw UUID, invalid QR, cached confirming identity, `scanned`, `already_scanned`, and partial participant merges.

- [ ] **Step 2: Run scanner-core tests and verify red**

Run: `npm test -- --runInBand src/services/__tests__/scannerCore.test.ts`

Expected: FAIL because `scannerCore.ts` is absent.

- [ ] **Step 3: Implement the pure state and mapping functions**

```typescript
export type ScannerOutcome = 'confirming' | 'scanned' | 'already_scanned' | 'not_scanned';

export interface ScannerResult {
  attemptId: string;
  rawData: string;
  source: 'qr' | 'nfc' | 'manual';
  outcome: ScannerOutcome;
  participant?: Participant;
  scanContext?: ScanContext;
  firstScannedAt?: string;
  message?: string;
  retryable: boolean;
}
```

`SameCodeGate` stores the last code and timestamp. A different code always passes. The same code passes only after its suppression interval.

- [ ] **Step 4: Refactor `useScanner` around one serialized request**

Remove local `scans_by_context` short-circuiting, offline pending-scan creation, the two-second cooldown, and outcome haptics from the hook. Resolve cached identity through `ParticipantIndex`, set `confirming`, call Rails with a stable attempt id, merge the response through `confirmParticipant`, and set the final result. Keep one `isProcessing` lock only for the authoritative request. `retryLastScan` reuses the raw data, context, timestamp, and client attempt id so an ambiguous transport failure remains idempotent.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand src/services/__tests__/scannerCore.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the scan core**

```bash
git add src/services/scannerCore.ts src/services/__tests__/scannerCore.test.ts src/hooks/useScanner.ts
git commit -m "refactor: make scanner results authoritative"
```

### Task 6: Add cached headshots and non-blocking feedback

**Files:**
- Create: `src/services/headshotCache.ts`
- Create: `src/services/__tests__/headshotCache.test.ts`
- Create: `src/services/scanFeedback.ts`
- Create: `src/services/__tests__/scanFeedback.test.ts`
- Create: `src/hooks/useScanFeedback.ts`
- Create: `assets/sounds/scanned.wav`
- Create: `assets/sounds/already-scanned.wav`
- Create: `assets/sounds/not-scanned.wav`
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Consumes: `ScannerOutcome` and participant `headshot_url` values.
- Produces: `prefetchHeadshots`, `clearHeadshotCache`, `feedbackForOutcome`, and `useScanFeedback().play(outcome)`.

- [ ] **Step 1: Write failing cache and feedback mapping tests**

```typescript
expect(feedbackForOutcome('scanned')).toEqual({
  sound: 'scanned',
  haptic: Haptics.NotificationFeedbackType.Success,
});
expect(feedbackForOutcome('already_scanned').sound).toBe('already-scanned');
expect(feedbackForOutcome('not_scanned').sound).toBe('not-scanned');
```

Mock `expo-image` and assert `prefetchHeadshots` filters missing URLs, removes duplicates, and sends batches of at most eight URLs with `cachePolicy: 'memory-disk'`. Assert logout clearing calls both memory and disk cache methods.

- [ ] **Step 2: Run feedback tests and verify red**

Run: `npm test -- --runInBand src/services/__tests__/scanFeedback.test.ts src/services/__tests__/headshotCache.test.ts`

Expected: FAIL because both services are absent.

- [ ] **Step 3: Generate three short original WAV assets**

Use `ffmpeg` lavfi sine sources to create cues under 350 ms: a rising two-note success cue, a neutral double cue, and a low rejection cue. Normalize each to avoid clipping and inspect durations with `ffprobe`.

- [ ] **Step 4: Implement image batching and feedback playback**

Use `Image.prefetch(batch, { cachePolicy: 'memory-disk' })`, `Image.clearMemoryCache()`, and `Image.clearDiskCache()`. In `useScanFeedback`, create three `useAudioPlayer(require(...))` players. On play, call `seekTo(0).then(() => player.play()).catch(() => {})` and start `Haptics.notificationAsync(...)` without awaiting either operation.

- [ ] **Step 5: Wire background prefetch and logout clearing**

After participant hydration, call `prefetchHeadshots` without putting it on the scanner critical path. During logout, await `clearHeadshotCache` after clearing participant storage.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- --runInBand src/services/__tests__/scanFeedback.test.ts src/services/__tests__/headshotCache.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit feedback and image caching**

```bash
git add assets/sounds src/services/headshotCache.ts src/services/scanFeedback.ts src/hooks/useScanFeedback.ts src/services/__tests__/headshotCache.test.ts src/services/__tests__/scanFeedback.test.ts src/context/AppContext.tsx
git commit -m "feat: cache headshots and add scan feedback"
```

### Task 7: Implement lifecycle-safe Power Mode

**Files:**
- Create: `src/services/scannerPower.ts`
- Create: `src/services/__tests__/scannerPower.test.ts`
- Create: `src/hooks/useScannerPowerMode.ts`

**Interfaces:**
- Consumes: persisted Power Mode preference, scanner focus, app state, and activity events.
- Produces: `ScannerPowerController`, `isPowerModeEnabled`, `setPowerModeEnabled`, and `recordScannerActivity`.

- [ ] **Step 1: Write failing fake-timer controller tests**

```typescript
jest.useFakeTimers();

it('dims after idle and restores on activity', async () => {
  const deps = powerDeps({ currentBrightness: 0.8 });
  const controller = new ScannerPowerController(deps, { idleMs: 30_000, dimLevel: 0.2 });
  await controller.enable();
  jest.advanceTimersByTime(30_000);
  await flushPromises();
  expect(deps.setBrightness).toHaveBeenCalledWith(0.2);
  await controller.recordActivity();
  expect(deps.setBrightness).toHaveBeenLastCalledWith(0.8);
});

it.each(['disable', 'background', 'dispose'] as const)('restores state on %s', async action => {
  const deps = powerDeps({ currentBrightness: 0.7 });
  const controller = new ScannerPowerController(deps, { idleMs: 30_000, dimLevel: 0.2 });
  await controller.enable();
  await controller[action]();
  expect(deps.restoreBrightness).toHaveBeenCalledWith(0.7);
  expect(deps.deactivateKeepAwake).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the controller tests and verify red**

Run: `npm test -- --runInBand src/services/__tests__/scannerPower.test.ts`

Expected: FAIL because `ScannerPowerController` does not exist.

- [ ] **Step 3: Implement an idempotent controller**

The controller stores original brightness once per active session, uses one timeout, calls `activateKeepAwakeAsync('attend-scanner')`, and guarantees one paired `deactivateKeepAwake('attend-scanner')`. `recordActivity` restores original app brightness before scheduling the next idle timer. Cleanup catches native errors but always clears internal active state.

- [ ] **Step 4: Implement the native hook adapter**

Use `Brightness.getBrightnessAsync`, `Brightness.setBrightnessAsync`, `Brightness.restoreSystemBrightnessAsync` on Android cleanup, and the keep-awake tagged methods. Load and persist `POWER_MODE_ENABLED`. Use `useFocusEffect` and `AppState.addEventListener` to enable only while the scanner is focused and the app is active.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand src/services/__tests__/scannerPower.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Power Mode**

```bash
git add src/services/scannerPower.ts src/services/__tests__/scannerPower.test.ts src/hooks/useScannerPowerMode.ts
git commit -m "feat: add scanner power mode"
```

### Task 8: Build and integrate the persistent identity card

**Files:**
- Create: `src/components/ParticipantAvatar.tsx`
- Create: `src/components/ScannerResultCard.tsx`
- Create: `src/components/__tests__/ScannerResultCard.test.tsx`
- Modify: `src/screens/ScannerScreen.tsx`
- Modify: `jest.config.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ScannerResult`, `play(outcome)`, `retryLastScan`, `recordScannerActivity`, and Power Mode state.
- Produces: a non-blocking accessible result card and continuous scanner screen.

- [ ] **Step 1: Load the Impeccable craft floor before UI edits**

Read the installed Impeccable `reference/craft-floor.md` once. Preserve the approved persistent-card hierarchy, the existing Hack Club tokens, native platform guidance, and the three exact outcome labels.

- [ ] **Step 2: Add the minimal component-test harness and write failing tests**

Install `react-test-renderer@19.1.0` and `@types/react-test-renderer`. Add Jest mappings for focused React Native and `expo-image` test doubles.

```typescript
it.each([
  ['scanned', 'Scanned'],
  ['already_scanned', 'Already Scanned'],
  ['not_scanned', 'Not Scanned'],
] as const)('renders %s copy', (outcome, label) => {
  const tree = renderer.create(
    <ScannerResultCard result={result({ outcome })} onDetails={jest.fn()} onRetry={jest.fn()} />
  );
  expect(JSON.stringify(tree.toJSON())).toContain(label);
});

it('renders a cached headshot and keeps details actionable', () => {
  const tree = renderer.create(
    <ScannerResultCard result={result({ participant: participant({ headshot_url: 'https://images/headshot' }) })} onDetails={jest.fn()} onRetry={jest.fn()} />
  );
  expect(tree.root.findByProps({ accessibilityLabel: 'Photo of Alex' })).toBeTruthy();
  expect(tree.root.findByProps({ accessibilityRole: 'button' })).toBeTruthy();
});
```

Add tests for initials fallback, context name, first-scan time, minimum safety alert, retry only on retryable failure, and no dismiss button.

- [ ] **Step 3: Run component tests and verify red**

Run: `npm test -- --runInBand src/components/__tests__/ScannerResultCard.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the avatar and result card**

Use `expo-image` with `cachePolicy="memory-disk"`, `contentFit="cover"`, `transition={reducedMotion ? 0 : 120}`, and a stable fixed-size fallback. Use `Ionicons` rather than text glyphs. The card has photo, name, pronouns, outcome, context, confirmation detail, authorized alerts, details, conditional retry, and `Ready for next attendee` copy. Do not include an X control.

- [ ] **Step 5: Integrate continuous scanning and Power Mode**

In `ScannerScreen`:

- delete `showResult`, its 30-second timer, and `lastScannedRef`;
- call `handleScan` whenever no authoritative request is active;
- keep `CameraView` mounted while results show;
- render `ScannerResultCard` directly from `lastScan`;
- keep manual entry available below or alongside the card instead of hiding it;
- play feedback once when a final result attempt id changes;
- call `recordScannerActivity` on QR recognition and all scanner touches;
- expose Power Mode in a 44/48-point toolbar control with an active text indicator;
- keep details navigation and failure retry optional, never required for the next scan.

- [ ] **Step 6: Run component, service, and type verification**

Run: `npm test -- --runInBand src/components/__tests__/ScannerResultCard.test.tsx src/services/__tests__/scannerCore.test.ts src/services/__tests__/scannerPower.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the scanner interface**

```bash
git add src/components/ParticipantAvatar.tsx src/components/ScannerResultCard.tsx src/components/__tests__/ScannerResultCard.test.tsx src/screens/ScannerScreen.tsx jest.config.js package.json package-lock.json
git commit -m "feat: build continuous scanner experience"
```

### Task 9: Verify the vertical flow and finish the design

**Files:**
- Modify if required by findings: the files changed in Tasks 1 through 8.
- Create through Impeccable finish: `DESIGN.md` and its sidecar when the documenter determines the exact boundary.

**Interfaces:**
- Consumes: deployed-shape Rails contract and completed mobile scanner.
- Produces: passing repository checks, visual evidence, detector output, finish-review verdict, and documented design system.

- [ ] **Step 1: Run all automated checks in Rails**

Run in `/Users/leo/Code/attend`:

```bash
bundle exec rspec spec/services/scan_recorder_spec.rb spec/requests/api/v1/scans_spec.rb
bin/rubocop app/services/scan_recorder.rb app/models/scan.rb app/controllers/api/v1/scans_controller.rb spec/services/scan_recorder_spec.rb spec/requests/api/v1/scans_spec.rb
```

Expected: PASS with no offenses.

- [ ] **Step 2: Run all automated checks in mobile**

Run in the mobile worktree:

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
```

Expected: PASS with no new warnings or errors.

- [ ] **Step 3: Exercise cross-device semantics against Rails**

Issue two authenticated requests for one participant/context with distinct `client_scan_id` values in parallel. Assert two persisted rows and exactly one response each for `scanned` and `already_scanned`. Repeat one `client_scan_id` and assert row count remains two.

- [ ] **Step 4: Perform one bounded native visual inspection round**

Capture phone and iPad scanner states for `confirming`, `Scanned`, `Already Scanned`, and `Not Scanned`, plus Power Mode active. Check camera continuity, safe areas, large names, photo fallback, contrast, touch targets, context dropdown overlap, keyboard overlays, and reduced motion. Fix all material findings in one batch, then confirm once.

- [ ] **Step 5: Run the Impeccable detector once**

Run:

```bash
node /Users/leo/.bb/runtime/global-skills/9c9d67931c4aec1ff20fa1948e067e0648b7c683042b5609e98aeffe748a8059/skills/impeccable/scripts/detect.mjs --json src/screens/ScannerScreen.tsx src/components/ScannerResultCard.tsx src/components/ParticipantAvatar.tsx
```

Fix mechanical findings once. Do not rerun the detector.

- [ ] **Step 6: Run the Impeccable finish reviewer and documenter**

Pass the original request, approved state-system direction, changed targets, native screenshots, detector output, design spec, and craft-floor path to the shipped finish reviewer. Apply its material fixes in one batch and obtain a verdict. Then run the shipped documenter with `PRODUCT.md`, the final scanner targets, and the approved contract so the built system is recorded in `DESIGN.md`.

- [ ] **Step 7: Commit final fixes and documentation**

```bash
git add src assets package.json package-lock.json jest.config.js DESIGN.md .impeccable
git commit -m "feat: finish continuous scanner flow"
```

- [ ] **Step 8: Report rollout order**

Hand off the Rails commit first, followed by the mobile commit. Report automated checks, device states inspected, the finish-review verdict, remaining open findings, and the fact that older mobile clients remain compatible with the additive Rails response.
