# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Attend has three audiences across its web and native surfaces: under-18 participants, their guardians, and Hack Club event staff. This native app actively serves two of them:

- **Staff:** Global Admin, Event Admin, Ops Staff, and Safeguarding Lead users working live events. Scanner interactions must work equally well for an experienced operator and for a rotating volunteer handed a device shortly before doors open.
- **Participants:** attendees using the app primarily on phones for tickets, wallet passes, event details, and organizer messages.

Guardians use the web product's consent and portal surfaces; this native app must not invent a competing guardian flow.

## Product Purpose

Attend onboards under-18 participants for in-person Hack Club events and coordinates the safeguarding, travel, accommodation, consent, and on-site operations needed to get them safely to and through an event. This native app extends that system into live-event staff operations and attendee tickets.

Success means staff can move attendees safely through a live event with minimal delay while the app preserves accurate, server-confirmed operational state.

## Positioning

- **The whole journey in one place.** Attend replaces disconnected forms, spreadsheets, and email chains with one participant status spanning onboarding, guardian consent, travel, rooming, check-in, messaging, and incidents.
- **Built for how Hack Club runs events.** Attend models real Hack Club operations rather than adapting a generic event platform. The native app supports context-specific QR and NFC scanning alongside attendee tickets.

Attend is not positioned as a general event product for other organizations.

## Operating Context

- The broader event cycle runs from event configuration through onboarding, guardian consent, travel and rooming operations, wallet pass issuance, on-site scanning, messaging, and incident handling.
- Organizer workflows run at event entrances, airports, and other live-event checkpoints where queues, noise, weak connectivity, time pressure, and multiple scanning devices are normal.
- Scans may represent general event check-in or attendance within a specific scan context.
- Staff need immediate identity confirmation, safety alerts, and unambiguous success or failure feedback without breaking the scan loop.
- Attendees use the same product family for tickets, wallet passes, event details, and organizer messages.

## Capabilities and Constraints

- The parent product is a Rails web application; this repository contains its Expo React Native companion for iOS, Android, phones, and iPads.
- Organizer entry methods include QR scanning, NFC badges where supported, participant search, and manual identifier entry.
- Participant and image data may be cached locally to keep lookup and identity confirmation fast.
- Attendance state is server-authoritative across users and devices. A scan is not presented as successful until the server confirms it.
- Offline state must be explicit. Cached data may remain available, but a disconnected device must not claim that an attendance mutation succeeded.
- Context-specific attendance must remain distinct from general event check-in.
- Medical, safeguarding, incident, and note data is sensitive, role-scoped product data. Scanner feedback may surface only the minimum safety information staff need at that checkpoint.

## Brand Commitments

- Hack Club's visual identity is binding. Attend does not have a separate brand.
- Preserve existing Hack Club identity assets and established product terminology unless a later brief explicitly replaces them.
- Operational copy should be direct, calm, and legible under pressure.

## Evidence on Hand

- The parent product authority is `/Users/leo/Code/attend/PRODUCT.md`.
- Existing organizer, participant, scanner, airport, kiosk, ticket, and participant-detail flows under `src/`.
- Existing Hack Club color tokens in `src/theme/colors.ts` and product assets under `assets/`.
- Participant records already expose `headshot_url`, operational alerts, and per-context scan summaries.
- The repository contains no approved performance benchmark, throughput claim, testimonial, or third-party customer evidence. Future work must not fabricate them.

## Product Principles

1. Design each surface for the person on it.
2. Keep the line moving without compromising state integrity.
3. Make identity and outcome unmistakable at a glance, by touch, and by sound.
4. Maintain one server-authoritative status everywhere, across every user and device.
5. Let real event operations beat abstraction while exposing sensitive data only to roles that need it.

## Accessibility & Inclusion

WCAG 2.1 AA is the floor. Critical scan outcomes must never depend on color alone. Combine clear language, iconography, sound, and distinct haptic patterns, while respecting device accessibility and reduced-motion settings. Controls must retain native touch targets and readable contrast in bright, dark, and high-pressure event environments.
