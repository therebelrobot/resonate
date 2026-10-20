# Session report and audio export: before and after

The feature: exporting one session used to mean printing the whole report from the
**Report for your SLP** screen and downloading its recordings separately (or not at all —
the browser-built CSV only *lists* them). There was no way to hand a clinician one session's
report together with that session's audio.

Now the session detail screen (reached from **History**) has an **Export** section: one zip
holding `report.pdf` and every recording from the session as a playable WAV, named for the
session, the step, and the time it was recorded.

Seeded session with three recordings, so the populated state is visible; a separate session
with no recordings covers the empty state.

| | |
|---|---|
| **Before** — `before/session-detail-mobile-light.png` | The screen ends at **Notes for your SLP** and **Delete this session**; no way to export the session with its audio. |
| **After** — `after/session-detail-mobile-light.png` | An **Export** section between them, with the **Include what I wrote** toggle and a **Download report and 3 recordings (.zip)** button. |
| **After (no recordings)** — `after/session-detail-empty-mobile-light.png` | Same section on a session with no audio: the button reads **Download report (.zip)**. |

Also captured, each with the before/after pair sharing the same viewport and theme:

- `*-mobile-dark.png` — 414x896, dark.
- `*-desktop-light.png` — 1280x900, light.

The rendered report itself is not a browser screenshot; it is the generated
`report.pdf`, and it is checked against a real PDF renderer rather than by inspecting bytes.
