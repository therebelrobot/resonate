# Fields read back from a recorded step

Stop a step's recording and the app measures the clip on the device and offers the
editor fields it can speak to — the step's minutes, the glide's high and low note,
the pace, register shifts, the warm-up repetitions and breaks, and more — each with
the confidence it was derived at and how it was measured. Nothing is written until
you tap a reading. See
[`docs/specs/adr-0005-recording-derived-step-fields.md`](../specs/adr-0005-recording-derived-step-fields.md).

All shots are at 390x844 (mobile) or 1280x900 (desktop), light unless labelled dark.
They were produced against a synthetic microphone — a smooth glide between the
plan's own anchors, 175 Hz and 349 Hz — fed through the app's real analysis core, so
the readings (`339 Hz (E4)`, `Mixed speeds`, `1`) are the Rust core's, not a mock.

## 1. The reading, offered rather than assumed

| | |
|---|---|
| **Before** — `before/editor-glides-recording-mobile-light.png` | A saved glide clip and blank fields: every value has to be typed by hand. |
| **After** — `after/editor-derived-glides-mobile-light.png` | The **From this recording** panel: minutes `0:07`, high note `339 Hz (E4)`, low note `183 Hz (F#3)`, pace `Mixed speeds`, register shifts `1` — each with a confidence and a method, and a **Use** control per reading. |
| **After** — `after/editor-derived-glides-mobile-dark.png` | The same panel, dark, showing readings after they were accepted (**Used**). |

## 2. Applied with one tap

| | |
|---|---|
| **Before** — `before/editor-glides-recording-desktop-light.png` | Desktop: the blank pitch fields and the recorder, no reading offered. |
| **After** — `after/editor-derived-applied-mobile-light.png` | After **Use all 5 solid readings**: minutes `0.1`, **Mixed speeds** selected, register shifts `1` — filled from the clip. |
| **After** — `after/editor-derived-glides-desktop-light.png` | Desktop: the full panel with each reading accepted. |

Readings the audio cannot support stand on their own feet or not at all: the warmer
the guess, the lower the confidence, and the weakest readings sit behind a
disclosure (**+ 1 weaker reading**) rather than in the main list.
