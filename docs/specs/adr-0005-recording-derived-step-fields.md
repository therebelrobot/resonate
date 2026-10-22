# ADR-0005 — Reading a recorded step back into the fields it can fill

Status: Accepted (2026-10-22)
Date: 2026-10-22

## Context

The editor asks for a lot the user already performed out loud: the minutes a step
took, the high and low note of a glide, the comfortable pitch of a resonance pass,
voice breaks, register shifts, the longest sustain, the warm-up repetitions. Typing
those in after the fact is the friction the log is supposed to remove, and every one
of them is something the app already has the means to measure.

Two things make this possible, and both already exist:

1. **Every step can be recorded inline.** A `StepRecorder` captures a clip, uploads
   it encrypted with the session, and keeps its length (`durationSeconds`) and the
   step it belongs to (`Recording.segmentKind`) as metadata.
2. **The Sonorant core is already here.** `client/audio/analysis.worker.ts` drives
   the Rust/WASM core into decoded `VoiceFrame`s (f0 with a confidence, formants,
   HNR/jitter/shimmer, input flags). Today it serves only the live monitor.

The app's rules constrain the shape of any answer:

- **No acoustic maths in TypeScript.** All measuring lives in the core; the app
  reads frames, it does not compute spectra.
- **Nothing is shown as a value without a confidence.** A pre-filled number is still
  a claim about the voice, so it has to carry one, and its provenance.

## Decision

1. **A saved clip is measured on the device, through the same core.** Stopping a
   take hands the `Blob` to `DerivedFields`, which decodes it (`OfflineAudioContext`)
   and pushes the PCM to a fresh instance of the analysis worker with a one-shot
   `resonate/analyze` message; the worker resets the engine, feeds the samples in
   chunks, and returns the decoded frames. Nothing leaves the phone, and the stored
   audio is never rewritten.

2. **Only the clip's length is read from the clock; every other field is read from
   the frames.** `deriveSegmentFields` (`client/audio/deriveSegmentFields.ts`) is a
   pure module - no DOM, so it is unit-testable in plain Node - that reads the core's
   frames into editor fields: pitch extremes and note names, the comfortable pitch,
   warm-up repetitions and breaks, glide pace and register shifts, the longest hold
   and the steps climbed, a Stretch and Flow stage from the voiced share, and the
   weaker inferred ratings (clarity, coordination, pace, fatigue).

3. **The readings are suggestions, never silent writes.** The panel lists each
   field's value, the confidence it was derived at (spelled out, via the existing
   `ConfidenceBadge`), and how it was measured. A reading is applied only on a tap -
   individually, or all the solid ones at once - so a clip can be measured without
   asserting anything on the user's behalf. Lower-confidence readings sit behind a
   disclosure.

4. **A clip is only read to a bounded window.** Audio over `MAX_ANALYSIS_SECONDS`
   (5 minutes) is not decoded; only its length is offered, so an endurance clip of an
   hour cannot force a gigabyte of PCM through the phone. The panel says so.

5. **The Stretch and Flow stage change is shared, not duplicated.** The editor's
   stage radio and the derived stage suggestion both call `stretchAndFlowStagePatch`
   in `shared/model.ts`, so the ratio, phase number, seeded steps, and air-only/voiced
   toggle cannot drift between the two paths.

## Rationale

- **The recording is the right source, not the live monitor.** The monitor's frames
  are capped, not associated with a step, and never stored; a step's clip is durable,
  already tied to the step, and already in the encrypted store.
- **Suggest rather than auto-fill.** Auto-writing values would put numbers on the
  form with no confidence and no provenance, and would quietly overwrite what the
  user typed. The whole point of the Sonorant display rules is that a measured value
  is a claim; a pre-filler is not exempt.
- **Reuse the worker, not a second core.** A one-shot message on the existing worker
  keeps one place that loads and verifies the WASM, and guarantees a saved clip and a
  live note are measured by the same code.
- **Pure derivation, tested against the real core.** Keeping `deriveSegmentFields`
  free of DOM and the core lets the thresholds be tested with synthetic frames, while
  an integration test runs a synthesized tone through the actual Sonorant WASM, so the
  whole path is exercised and not just the arithmetic.
- **Provisional thresholds, said so.** The pace and stage boundaries behave sensibly
  on speech but are not from a clinical source; they carry the same "validate before
  trusting" caveat as the display-smoothing defaults.

## Consequences

- The editor gains a per-step panel and one optional callback on `StepRecorder`
  (`onRecorded`), called before upload so the reading can run while the audio is on
  its way to the store.
- A clip is decoded and analysed once per take; the cost is bounded by the 5-minute
  cap and runs off the main thread. A take over the cap costs only its length.
- The derived fields are not persisted; they are offered in the session that recorded
  them. Reopening the editor later does not re-analyse, because no clip is re-read
  without a fresh take.
- Two ratings that are genuinely hard to read from audio alone - endurance pace and
  fatigue - are offered with a floor of confidence and an explicit caveat, and are
  grouped with the other weak readings.

## Alternatives considered

- **Auto-fill every empty field.** Rejected: no confidence, no provenance, and it
  fights the user's own corrections.
- **Analyse the whole clip regardless of length.** Rejected: an hour of decoded PCM
  is hundreds of megabytes on a phone, for fields endurance does not even derive.
- **A separate analysis worker and a second engine load.** Rejected: two places to
  load and hash-check the core, for no gain.
- **Persist the derived frames with the session.** Rejected: recordings already carry
  the source; storing the measurements too would double the storage and make the
  numbers look authoritative long after the clip was the thing that mattered.
