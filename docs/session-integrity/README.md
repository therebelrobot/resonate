# Session integrity: before and after

The bug: an in-progress session lived only in `SessionEditor`'s React state, so locking
(which unmounts the shell) dropped everything entered so far.

Reproduced on a real build: start a session, fill Glides (7 minutes, "Slow and steady",
a note), advance to Endurance (8/9), then lock and unlock.

| | |
|---|---|
| **Before** — `before/lost-after-unlock.png` | After unlock, the URL still names the draft, but the editor is empty: Glides shows 0 minutes, no pace, no note. |
| **After** — `after/resume-after-lock.png` | After unlock, the editor offers to resume the encrypted draft instead of silently losing it. |
| **After (resumed)** — `after/resumed-editor.png` | Choosing **Resume** restores the fields and the step: back on Endurance, 8/9. |

Additional after-states: `after/resume-banner-dark.png` (dark, mobile) and
`after/resume-banner-desktop.png` (light, desktop). All captured at 390x844 except the
desktop shot at 1280x900; the before and after-lock pair share the same viewport, theme, and
lock-then-unlock trigger.
