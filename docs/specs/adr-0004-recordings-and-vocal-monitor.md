# ADR-0004 — Inline audio recordings and the Sonorant vocal monitor

Status: Accepted (2026-10-19)
Date: 2026-10-19

## Context

Three changes arrive together on `feat/realtime-feedback-recording`:

1. **A bug.** The printed SLP report (`client/screens/ReportScreen.tsx`) rendered
   only the session-level `slpNote`. A note typed on a step (`segment.notes`) and
   the free-text carryover fields (`stretchAndFlow.carryover.customText`,
   `carryover.customContext`) were dropped from the PDF and the browser-built SLP
   CSV. The session detail screen already showed them, so the report was the odd
   one out.

2. **Inline recording per step**, stored with the session and carried in an export.
   The app is encrypted at rest (`server/crypto/envelope.ts`), API bodies are capped
   at 256 KB (`server/app.ts`), and the browser stores no session content outside
   React state. A recording is far larger than any existing payload.

3. **A real-time vocal monitor** using [`therebelrobot/sonorant`](https://github.com/therebelrobot/sonorant),
   a sticky view of pitch and resonance on every screen. Sonorant's runtime is now
   published as `sonorant` (WASM analysis core) and `sonorant-react`
   (visualisations). Its rules are load-bearing: **no acoustic maths in TypeScript**
   (all of it lives in the Rust core) and **no backend / no audio egress**. The app's
   `Permissions-Policy` forbade the microphone (`microphone=()`), and the CSP denied
   WebAssembly (`script-src 'self'`, no `wasm-unsafe-eval`).

## Decision

1. **Fix the report by rendering everything that was written.** A `SessionWrittenNotes`
   component prints each step's note and the carryover free text where the session
   note already appeared, and the SLP CSV gains one row per step note. The `include
   what I wrote` checkbox still gates all of it.

2. **Recordings are encrypted blobs in their own table.** A `recordings` row holds
   encrypted metadata (`payload`) and encrypted audio (`audio`), each with AAD naming
   `recordings`/`recording_audio` and the row id, exactly like every other payload.
   `session_id` is a plaintext lookup column (a random id, not content). Audio is
   captured with `MediaRecorder` on the shared microphone stream, uploaded as base64
   to `POST /api/sessions/:sessionId/recordings`, streamed back through
   `GET /api/recordings/:id/audio`, and included in the server JSON export with its
   bytes in `audioBase64`. Deleting a session deletes its recordings.

3. **The recording upload is the one route with a larger body limit.** The global
   `/api/*` limit stays at 256 KB; the recordings POST gets a bounded
   `MAX_RECORDING_BYTES`-derived limit. The schema enforces the same ceiling.

4. **The monitor reuses Sonorant rather than reimplementing it.** One microphone
   feeds one pipeline: capture worklet (`client/public/capture-processor.js`) →
   analysis Worker (`client/audio/analysis.worker.ts`, which loads the `sonorant`
   WASM core) → decoded frames. `sonorant-react` draws the pad and the
   confidence-bearing summary. `AudioCaptureProvider` owns the stream and shares it
   with `MediaRecorder`, so the recorder works whether or not the monitor is running.
   The core is verified against its published SHA-256 before instantiation.

5. **Grant the microphone and allow WebAssembly, deliberately.** `Permissions-Policy`
   becomes `microphone=(self)`; the CSP gains `script-src 'self' 'wasm-unsafe-eval'`,
   `media-src 'self' blob:` and `worker-src 'self' blob:`. The monitor only starts on
   an explicit tap, and unlocking (which unmounts the provider) releases the mic.

## Rationale

- **Storage in the database, not the filesystem.** It keeps one encrypted store, one
  backup story, and the same AAD-bound-blob guarantee as every other record. The
  alternative (files on disk) adds a second lifecycle to protect and back up.
- **Upload on stop, not on save.** The app's whole design is that nothing is lost to
  a lock or a backgrounded tab; holding audio only in the tab would reintroduce that
  risk. A recording on a brand-new session forces the draft into existence so the
  clip has a durable home.
- **One microphone, two consumers.** Asking for the mic twice would be surprising,
  and the monitor and the recorder want the same constraints.
- **Vendored through npm, but pinned.** The packages are public-domain, real, and
  versioned; the app takes them as normal dependencies and the Docker build stays
  self-contained. The wasm hash check means a tampered artifact fails loudly.

## Consequences

- The runtime dependency count rises from five to seven (`sonorant`,
  `sonorant-react`); both are client-only and never enter the server bundle.
- The production CSP is slightly wider: WebAssembly instantiation and blob media are
  allowed. `wasm-unsafe-eval` does not enable JavaScript `eval`.
- `staticAssets.ts` must serve `.wasm` as `application/wasm`; without it the core
  would receive `index.html` and fail to instantiate.
- Recordings leave in an export as base64 and, being plaintext once exported, are
  audited (`recording_saved`, `recording_played`). The export can get large.
- The monitor is a real-time DSP loop in a Worker; it is stopped on lock and never
  plays audio back (the worklet node is not connected to the output).

## Alternatives considered

- **Local-only audio (browser storage).** Rejected: it contradicts "store alongside
  the session data", and the app deliberately keeps no decrypted content in browser
  storage.
- **Files on disk for recordings.** Rejected: a second store to encrypt, back up, and
  garbage-collect for little gain at this scale.
- **Reimplement pitch/resonance in TypeScript.** Rejected: it duplicates the acoustic
  maths, and Sonorant exists precisely so there is one implementation.
- **Auto-start the monitor on every page.** Rejected: a microphone that turns itself
  on is the wrong default; the strip is always present, but listening starts on a tap.
- **Put audio inside each session's encrypted JSON.** Rejected: it would force a
  re-encryption of the whole session on every save and bloat reads that want only
  metadata.
