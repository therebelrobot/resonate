import type { TagKind } from '../shared/model'

/**
 * Starting vocabulary, taken from the plan. Everything here is editable in the
 * app; these are seeds, not a fixed schema. Wins and watch items are separate
 * kinds so the report can count symptoms without reading your notes.
 */
export const DEFAULT_TAGS: readonly { kind: TagKind; name: string }[] = [
  // What you are working on
  { kind: 'focus', name: 'Breath support' },
  { kind: 'focus', name: 'Diaphragmatic breathing' },
  { kind: 'focus', name: 'Smooth onset' },
  { kind: 'focus', name: 'Register transition' },
  { kind: 'focus', name: 'Sustained phonation' },
  { kind: 'focus', name: 'Resonance' },
  { kind: 'focus', name: 'Volume control' },
  { kind: 'focus', name: 'Pitch range' },
  { kind: 'focus', name: 'Articulation' },
  { kind: 'focus', name: 'Pacing while reading' },

  // What went well
  { kind: 'win', name: 'Clear vibration' },
  { kind: 'win', name: 'No voice breaks' },
  { kind: 'win', name: 'Easy register shift' },
  { kind: 'win', name: 'Steady sustain' },
  { kind: 'win', name: 'Comfortable high note' },
  { kind: 'win', name: 'Breath lasted the phrase' },
  { kind: 'win', name: 'Less effort than usual' },
  { kind: 'win', name: 'Held a long note' },

  // What to watch
  { kind: 'watch', name: 'Voice breaks' },
  { kind: 'watch', name: 'Roughness' },
  { kind: 'watch', name: 'Breathiness' },
  { kind: 'watch', name: 'Strain' },
  { kind: 'watch', name: 'Pitch instability' },
  { kind: 'watch', name: 'Register break' },
  { kind: 'watch', name: 'Ran out of breath' },
  { kind: 'watch', name: 'Fatigue' },
  { kind: 'watch', name: 'Dryness' },
  { kind: 'watch', name: 'Better on a repeat try' },

  // Glide shape and motion
  { kind: 'glideShape', name: 'Steady' },
  { kind: 'glideShape', name: 'Mountain' },
  { kind: 'glideShape', name: 'Valley' },
  { kind: 'glideShape', name: 'Rising' },
  { kind: 'glideShape', name: 'Falling' },
  { kind: 'glideShape', name: 'Staccato' },

  // What you phonated on
  { kind: 'utterance', name: 'Eee' },
  { kind: 'utterance', name: 'Ooh' },
  { kind: 'utterance', name: 'Ole' },
  { kind: 'utterance', name: 'Hum' },
  { kind: 'utterance', name: 'Sustained vowel' },
  { kind: 'utterance', name: 'Speech' },

  // Reading material
  { kind: 'material', name: 'Star Trek episode summary' },
  { kind: 'material', name: 'Cozy novel' },
  { kind: 'material', name: 'Other' },
]
