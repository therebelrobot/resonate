# Inline recording, a live vocal monitor, and the SLP report notes fix

Three changes on `feat/realtime-feedback-recording`, captured as before/after pairs.
All shots are at 390x844 (mobile) or 1280x900 (desktop), light unless labelled dark.

## 1. Step notes now reach the SLP report (bug fix)

The printed report rendered only the session-level note; a note typed on a step was
dropped from the PDF and the browser-built SLP CSV.

| | |
|---|---|
| **Before** — `before/report-no-step-notes-mobile-light.png` | The session shows the SLP note only. No step note, no recordings. |
| **After** — `after/report-step-notes-mobile-light.png` | The Warm-up step note and the SLP note both print, and the session's recordings are listed with their durations. |

## 2. Record audio inline on any step

Every editor step gains a Record control; stopping uploads the clip to the encrypted
store and attaches it to the session.

| | |
|---|---|
| **Before** — `before/editor-warmup-no-recorder-mobile-light.png` | The Warm-up step has no way to record. |
| **After** — `after/editor-warmup-recorder-mobile-light.png` | A **Record warm-up note** button sits at the foot of the step. |
| **After** — `after/editor-recording-saved-mobile-light.png` | After stopping, the clip appears with its length, a player, and a Delete control. |

## 3. A sticky live vocal monitor on every screen

Pitch and resonance are shown separately, with a confidence, anywhere in the app.

| | |
|---|---|
| **Before** — `before/today-no-monitor-mobile-light.png` | No monitor; nothing measures the voice during practice. |
| **After** — `after/today-monitor-off-mobile-light.png` | The strip is present but off until you tap **Start**. |
| **After** — `after/today-monitor-on-mobile-light.png` | Live: pitch in Hz with its note name, and resonance in semitones. |
| **After** — `after/today-monitor-expanded-mobile-light.png` | Expanded: the pitch-by-resonance pad, the written summary, confidence, and input flags. |
| **After** — `after/today-monitor-expanded-mobile-dark.png` | The same, dark. |
| **After** — `after/today-monitor-on-desktop-light.png` | Desktop: the strip docks bottom-right, clear of the side navigation. |

The "after" monitor shots were produced against a synthetic 196 Hz tone fed through a
fake microphone, so the readout (`196 Hz · G3`) is the real analysis core, not a mock.
