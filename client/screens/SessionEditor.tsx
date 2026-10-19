import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api'
import { navigateTo, replaceHashQuietly } from '../router'
import { useSessionData } from '../sessionData'
import {
  clearEditorDraft,
  isEditorDraftFresh,
  readEditorDraft,
  writeEditorDraft,
  type EditorDraftSnapshot,
} from '../editorDraftStore'
import { IntensitySlider } from '../components/IntensitySlider'
import { StepRecorder } from '../components/StepRecorder'
import { TagPicker } from '../components/TagPicker'
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../format'
import {
  GLIDE_PACES,
  GLIDE_PACE_LABELS,
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
  createEmptyCarryoverDetail,
  createEmptyPitchWork,
  createEmptyResonanceDetail,
  createEmptySegmentInput,
  createEmptySessionInput,
  createEmptyStretchAndFlowDetail,
  noteNameForHz,
  parseBreathCountInput,
  sortSegmentsByProtocolOrder,
  type CarryoverDetail,
  type PitchWorkInput,
  type Recording,
  type ResonanceDetail,
  type Session,
  type SessionInput,
  type SessionSegmentInput,
  type SessionStatus,
  type StretchAndFlowCarryoverKind,
  type StretchAndFlowCarryoverLog,
  type StretchAndFlowDetail,
  type StretchAndFlowStepProgress,
  type TagKind,
} from '../../shared/model'
import {
  CARRYOVER_CONTEXTS,
  CARRYOVER_WEEKLY_CONVERSATION_TARGET,
  LAST_STRETCH_AND_FLOW_PHASE,
  RESONANCE_SENTENCES,
  RESONANCE_STEPS,
  SEGMENT_DEFINITIONS,
  STRETCH_AND_FLOW_CARRYOVER,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_PACING,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  STRETCH_AND_FLOW_STAGES,
  STRETCH_AND_FLOW_STEPS,
  VFE_PITCH_TARGETS,
  stretchAndFlowStepLabel,
  type SegmentKind,
  type StretchAndFlowStage,
} from '../../shared/protocol'

const EDITOR_STEPS = [
  'start',
  'warmupNote',
  'glides',
  'power',
  'stretchAndFlow',
  'resonance',
  'carryover',
  'endurance',
  'finish',
] as const
type EditorStep = (typeof EDITOR_STEPS)[number]

const STEP_LABELS: Record<EditorStep, string> = {
  start: 'Start',
  warmupNote: 'Warm-up',
  glides: 'Glides',
  power: 'POWER',
  stretchAndFlow: 'Stretch',
  resonance: 'Resonance',
  carryover: 'Carry-Over',
  endurance: 'Endurance',
  finish: 'Finish',
}

/** Copies a stored session into the exact shape the save endpoint validates. */
function toSessionInput(session: Session): SessionInput {
  return {
    occurredAt: session.occurredAt,
    status: session.status,
    role: session.role,
    effortBefore: session.effortBefore,
    effortAfter: session.effortAfter,
    focusTagIds: [...session.focusTagIds],
    winTagIds: [...session.winTagIds],
    watchTagIds: [...session.watchTagIds],
    slpNote: session.slpNote,
    segments: session.segments.map((segment) => ({ ...segment, tagIds: [...segment.tagIds] })),
  }
}

function toMinutesText(segments: readonly SessionSegmentInput[]): Record<string, string> {
  const textByKind: Record<string, string> = {}
  for (const segment of segments) {
    textByKind[segment.kind] = segment.seconds > 0 ? String(Math.round((segment.seconds / 60) * 10) / 10) : ''
  }
  return textByKind
}

/** Empty or garbage input means "no time recorded", not NaN. */
function parseMinutesToSeconds(text: string): number {
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : 0
}

/** How long after the last keystroke the draft is written to the server. */
const AUTOSAVE_DEBOUNCE_MILLISECONDS = 1_200

/**
 * Whether a draft holds anything worth protecting. An editor the user opened and
 * left untouched is neither autosaved nor offered for resume, so the banner only
 * appears when there is real work to get back.
 */
function hasMeaningfulContent(draft: SessionInput, minutesText: Record<string, string>, stepIndex: number): boolean {
  if (stepIndex > 0) return true
  if (draft.role !== 'warmup' || draft.effortBefore !== 50 || draft.effortAfter !== null) return true
  if (draft.slpNote.trim() !== '') return true
  if (draft.focusTagIds.length > 0 || draft.winTagIds.length > 0 || draft.watchTagIds.length > 0) return true
  if (Object.values(minutesText).some((text) => text.trim() !== '')) return true
  return draft.segments.some(
    (segment) =>
      segment.seconds > 0 ||
      segment.notes.trim() !== '' ||
      segment.tagIds.length > 0 ||
      segment.repetitions !== null ||
      segment.clarityRating !== null ||
      segment.voiceBreaks !== null ||
      segment.glidePace !== null ||
      segment.registerShifts !== null ||
      segment.startNote.trim() !== '' ||
      segment.topNote.trim() !== '' ||
      segment.bottomNote.trim() !== '' ||
      segment.notesClimbed !== null ||
      segment.longestSustainSeconds !== null ||
      segment.identifiedComfortableRange ||
      segment.phaseNumber !== null ||
      segment.coordinationRating !== null ||
      segment.stretchAndFlow !== null ||
      segment.pitch !== null ||
      segment.resonance !== null ||
      segment.carryover !== null ||
      segment.paceRating !== null ||
      segment.fatigueRating !== null,
  )
}

/** Turns a stored session row into the snapshot the editor resumes from. */
function snapshotFromSession(session: Session): EditorDraftSnapshot {
  return {
    editorKey: 'new',
    draft: toSessionInput(session),
    minutesText: toMinutesText(session.segments),
    stepIndex: 0,
    savedSessionId: session.id,
    updatedAtMilliseconds: Date.now(),
  }
}

/** A snapshot worth offering: it holds real work, or an autosaved server draft. */
function isResumableDraft(snapshot: EditorDraftSnapshot): boolean {
  return hasMeaningfulContent(snapshot.draft, snapshot.minutesText, snapshot.stepIndex) || snapshot.savedSessionId !== null
}

export function SessionEditor({
  existingSession,
  initialDraftId,
}: {
  existingSession?: Session
  initialDraftId?: string
}) {
  const { refresh, sessions, isLoading, recordingsBySessionId } = useSessionData()

  // The editor's identity in the in-memory draft store: a new session is 'new',
  // an edit is keyed by the session id. It stays stable across a lock/unlock.
  const editorKey = existingSession ? existingSession.id : 'new'
  // A new session can be found again after a reload through the id autosave put
  // in the URL hash; an edit's own row is already its durable copy.
  const draftIdFromHash = existingSession ? undefined : initialDraftId

  const [draft, setDraft] = useState<SessionInput>(() =>
    existingSession ? toSessionInput(existingSession) : createEmptySessionInput(),
  )
  const [minutesText, setMinutesText] = useState<Record<string, string>>(() =>
    toMinutesText(existingSession?.segments ?? []),
  )
  const [stepIndex, setStepIndex] = useState(0)
  const [savedSessionId, setSavedSessionId] = useState<string | null>(existingSession?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  // A draft to offer, resolved on mount. The in-memory snapshot wins when the tab
  // is still alive (a lock/unlock, and it remembers the wizard step); failing
  // that, a new session can still be found from the server by the id in the hash
  // (a reload). The form waits behind the choice so a pending snapshot is never
  // written over.
  const [initialResume] = useState(() => {
    const snapshot = readEditorDraft(editorKey)
    const memoryCandidate = snapshot && isEditorDraftFresh(snapshot) && isResumableDraft(snapshot) ? snapshot : null
    return { candidate: memoryCandidate, resolved: memoryCandidate !== null || !draftIdFromHash }
  })
  const [resumeCandidate, setResumeCandidate] = useState<EditorDraftSnapshot | null>(initialResume.candidate)
  const [hasResolvedResume, setHasResolvedResume] = useState(initialResume.resolved)

  const currentStep = EDITOR_STEPS[stepIndex]!
  const includedKinds = draft.segments.map((segment) => segment.kind)
  const totalMinutes = draft.segments.reduce((total, segment) => total + segment.seconds, 0) / 60

  const segmentOf = (kind: SegmentKind) => draft.segments.find((segment) => segment.kind === kind)

  const updateSegment = (kind: SegmentKind, patch: Partial<SessionSegmentInput>) => {
    setDraft((previous) => ({
      ...previous,
      segments: sortSegmentsByProtocolOrder(
        previous.segments.map((segment) => (segment.kind === kind ? { ...segment, ...patch } : segment)),
      ),
    }))
  }

  const toggleSegment = (kind: SegmentKind, included: boolean) => {
    setDraft((previous) => ({
      ...previous,
      segments: included
        ? sortSegmentsByProtocolOrder([...previous.segments, createEmptySegmentInput(kind)])
        : previous.segments.filter((segment) => segment.kind !== kind),
    }))
  }

  const setMinutes = (kind: SegmentKind, text: string) => {
    setMinutesText((previous) => ({ ...previous, [kind]: text }))
    updateSegment(kind, { seconds: parseMinutesToSeconds(text) })
  }

  const setTagIds = (tagKind: TagKind, tagIds: string[]) => {
    setDraft((previous) =>
      tagKind === 'focus'
        ? { ...previous, focusTagIds: tagIds }
        : tagKind === 'win'
          ? { ...previous, winTagIds: tagIds }
          : { ...previous, watchTagIds: tagIds },
    )
  }

  const tagIdsFor = (tagKind: TagKind) =>
    tagKind === 'focus' ? draft.focusTagIds : tagKind === 'win' ? draft.winTagIds : draft.watchTagIds

  // Latest values for the autosave timer and the flush listeners, so neither
  // depends on a stale render closure.
  const latestRef = useRef({ draft, minutesText, stepIndex })
  latestRef.current = { draft, minutesText, stepIndex }
  // The draft row id is tracked in a ref as well as state: it has to be readable
  // synchronously the moment an autosave resolves, before React re-renders.
  const savedSessionIdRef = useRef<string | null>(existingSession?.id ?? null)
  savedSessionIdRef.current = savedSessionId
  const isBlockedRef = useRef(false)
  isBlockedRef.current = !hasResolvedResume || resumeCandidate !== null
  // Set while a final save runs, so no queued autosave can recreate or demote it.
  const isFinalizingRef = useRef(false)
  const autosavePromiseRef = useRef<Promise<void> | null>(null)
  const autosaveQueuedRef = useRef(false)

  /**
   * Writes the open draft to the encrypted store. Best-effort and silent: the
   * in-memory snapshot and the resume banner still hold the work if a write
   * fails or the session has already locked.
   */
  const runAutosave = (): Promise<void> => {
    if (isBlockedRef.current || isFinalizingRef.current) return Promise.resolve()
    const inFlight = autosavePromiseRef.current
    if (inFlight) {
      autosaveQueuedRef.current = true
      return inFlight
    }
    const { draft: latestDraft, minutesText: latestMinutes, stepIndex: latestStep } = latestRef.current
    // Never rewrite a finished record automatically; only drafts and new sessions autosave.
    if (existingSession && existingSession.status === 'complete') return Promise.resolve()
    if (!hasMeaningfulContent(latestDraft, latestMinutes, latestStep)) return Promise.resolve()
    const promise = (async () => {
      try {
        const payload: SessionInput = { ...latestDraft, status: 'draft' }
        const saved = savedSessionIdRef.current
          ? await api.replaceSession(savedSessionIdRef.current, payload)
          : await api.createSession(payload)
        savedSessionIdRef.current = saved.id
        setSavedSessionId(saved.id)
        await refresh()
        if (!existingSession) replaceHashQuietly(`/log/${saved.id}`)
      } catch {
        // Intentionally quiet; see the comment above.
      } finally {
        autosavePromiseRef.current = null
        if (autosaveQueuedRef.current) {
          autosaveQueuedRef.current = false
          void runAutosave()
        }
      }
    })()
    autosavePromiseRef.current = promise
    return promise
  }
  const runAutosaveRef = useRef(runAutosave)
  runAutosaveRef.current = runAutosave

  // A recording needs a saved session to attach to. Autosave deliberately skips a
  // session with nothing written yet, so a recording on a fresh session creates the
  // draft directly rather than finding no home for the audio.
  const ensureSessionId = async (): Promise<string | null> => {
    if (savedSessionIdRef.current) return savedSessionIdRef.current
    const inFlight = autosavePromiseRef.current
    if (inFlight) await inFlight.catch(() => undefined)
    if (savedSessionIdRef.current) return savedSessionIdRef.current
    try {
      const saved = await api.createSession({ ...latestRef.current.draft, status: 'draft' })
      savedSessionIdRef.current = saved.id
      setSavedSessionId(saved.id)
      await refresh()
      if (!existingSession) replaceHashQuietly(`/log/${saved.id}`)
      return saved.id
    } catch {
      return null
    }
  }
  const recorderConfig = {
    sessionId: savedSessionId,
    ensureSessionId,
    recordings: savedSessionId ? recordingsBySessionId.get(savedSessionId) ?? [] : [],
    onChanged: () => void refresh(),
  } satisfies { sessionId: string | null; ensureSessionId: () => Promise<string | null>; recordings: Recording[]; onChanged: () => void }

  // Resolve a draft named in the URL hash once the session list is available.
  useEffect(() => {
    if (hasResolvedResume) return
    if (isLoading) return
    const fromServer = draftIdFromHash
      ? sessions.find((session) => session.id === draftIdFromHash && session.status === 'draft')
      : undefined
    if (fromServer) setResumeCandidate(snapshotFromSession(fromServer))
    else replaceHashQuietly('/log')
    setHasResolvedResume(true)
  }, [hasResolvedResume, isLoading, sessions, draftIdFromHash])

  // Keep the in-memory snapshot current, so a lock/unlock can pick it up.
  useEffect(() => {
    if (!hasResolvedResume || resumeCandidate) return
    writeEditorDraft({ editorKey, draft, minutesText, stepIndex, savedSessionId, updatedAtMilliseconds: Date.now() })
  }, [hasResolvedResume, resumeCandidate, editorKey, draft, minutesText, stepIndex, savedSessionId])

  // Debounced autosave to the encrypted store.
  useEffect(() => {
    if (!hasResolvedResume || resumeCandidate) return
    const timer = window.setTimeout(() => void runAutosaveRef.current(), AUTOSAVE_DEBOUNCE_MILLISECONDS)
    return () => window.clearTimeout(timer)
  }, [hasResolvedResume, resumeCandidate, draft, minutesText, stepIndex])

  // Flush the draft the moment the page is hidden, so the server copy exists
  // before the idle lock (which fires while the app is in the background) can
  // take the session away. This deliberately does not also listen for the lock
  // event: by then the server session is already gone, and re-running the save
  // on that event would only bounce the same 401 back.
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void runAutosaveRef.current()
    }
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => document.removeEventListener('visibilitychange', flushWhenHidden)
  }, [])

  const resumeDraft = () => {
    if (!resumeCandidate) return
    setDraft(resumeCandidate.draft)
    setMinutesText(resumeCandidate.minutesText)
    setStepIndex(Math.min(resumeCandidate.stepIndex, EDITOR_STEPS.length - 1))
    setSavedSessionId(resumeCandidate.savedSessionId)
    setError(null)
    if (!existingSession && resumeCandidate.savedSessionId) replaceHashQuietly(`/log/${resumeCandidate.savedSessionId}`)
    setResumeCandidate(null)
  }

  const startFresh = async () => {
    if (!resumeCandidate) return
    clearEditorDraft(editorKey)
    if (!existingSession && resumeCandidate.savedSessionId) {
      await api.deleteSession(resumeCandidate.savedSessionId).catch(() => undefined)
      await refresh().catch(() => undefined)
    }
    if (existingSession) {
      setDraft(toSessionInput(existingSession))
      setMinutesText(toMinutesText(existingSession.segments))
      setStepIndex(0)
      setSavedSessionId(existingSession.id)
    } else {
      replaceHashQuietly('/log')
    }
    setError(null)
    setResumeCandidate(null)
  }

  const cancel = () => navigateTo(existingSession ? `/sessions/${existingSession.id}` : '/sessions')

  const save = async (status: SessionStatus) => {
    isFinalizingRef.current = true
    setIsBusy(true)
    setError(null)
    try {
      // Let any autosave already in flight land first, so the final write reuses
      // its row instead of racing it into a duplicate.
      const inFlight = autosavePromiseRef.current
      if (inFlight) await inFlight.catch(() => undefined)
      const payload: SessionInput = { ...latestRef.current.draft, status }
      const savedSession = savedSessionIdRef.current
        ? await api.replaceSession(savedSessionIdRef.current, payload)
        : await api.createSession(payload)
      savedSessionIdRef.current = savedSession.id
      setSavedSessionId(savedSession.id)
      clearEditorDraft(editorKey)
      await refresh()
      navigateTo(`/sessions/${savedSession.id}`, { replace: true })
    } catch (saveError) {
      isFinalizingRef.current = false
      setError(saveError instanceof Error ? saveError.message : 'Could not save this session.')
      setIsBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (stepIndex < EDITOR_STEPS.length - 1) setStepIndex(stepIndex + 1)
    else void save('complete')
  }

  // Opening a draft named in the hash: hold the form until it resolves.
  if (!hasResolvedResume) {
    return (
      <form className="editor" onSubmit={(event) => event.preventDefault()}>
        <div className="editor-bar">
          <button
            type="button"
            className="button button-quiet"
            onClick={cancel}
          >
            Cancel
          </button>
          <span className="editor-bar-title">{existingSession ? 'Editing session' : 'New session'}</span>
          <span className="step-count" aria-hidden="true" />
        </div>
        <p className="screen-message editor-step">Opening your practice log...</p>
      </form>
    )
  }

  // An unfinished draft: offer to pick it up rather than silently losing it.
  if (resumeCandidate) {
    return (
      <form className="editor" onSubmit={(event) => event.preventDefault()}>
        <div className="editor-bar">
          <button
            type="button"
            className="button button-quiet"
            onClick={cancel}
          >
            Cancel
          </button>
          <span className="editor-bar-title">{existingSession ? 'Editing session' : 'New session'}</span>
          <span className="step-count" aria-hidden="true" />
        </div>
        <div className="editor-step">
          <section className="resume-banner" aria-labelledby="resume-heading">
            <h2 id="resume-heading">{existingSession ? 'Unsaved changes' : 'Unfinished session'}</h2>
            <p>
              {existingSession
                ? 'You had edits to this session that were not saved. Pick up where you left off, or discard them and go back to the saved version.'
                : resumeCandidate.savedSessionId
                  ? 'You started a session but did not finish it. It was saved encrypted as a draft.'
                  : 'You started a session but did not finish it.'}
            </p>
            <div className="resume-actions">
              <button type="button" className="button button-primary" onClick={resumeDraft}>
                {existingSession ? 'Resume editing' : 'Resume'}
              </button>
              <button type="button" className="button button-secondary" onClick={() => void startFresh()}>
                {existingSession ? 'Discard changes' : 'Start fresh'}
              </button>
            </div>
          </section>
        </div>
      </form>
    )
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="editor-bar">
        <button type="button" className="button button-quiet" onClick={cancel}>
          Cancel
        </button>
        <span className="editor-bar-title">{existingSession ? 'Editing session' : 'New session'}</span>
        <span className="step-count">
          {stepIndex + 1}/{EDITOR_STEPS.length}
        </span>
      </div>

      <nav className="step-track" aria-label="Session steps">
        <ol>
          {EDITOR_STEPS.map((step, index) => (
            <li key={step}>
              <button
                type="button"
                className="step-track-button"
                aria-current={index === stepIndex ? 'step' : undefined}
                data-visited={index < stepIndex}
                onClick={() => setStepIndex(index)}
              >
                <span className="step-track-bar" />
                <span className="step-track-label">{STEP_LABELS[step]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="editor-step">
        <h2>{STEP_LABELS[currentStep]}</h2>

        {currentStep === 'start' && (
          <div className="editor-fields">
            <div className="field">
              <label className="field-label" htmlFor="occurred-at">
                When
              </label>
              <input
                id="occurred-at"
                type="datetime-local"
                value={toDateTimeLocalValue(draft.occurredAt)}
                onChange={(event) => setDraft({ ...draft, occurredAt: fromDateTimeLocalValue(event.target.value) })}
              />
            </div>
            <div className="field">
              <p className="field-label">Role in the day</p>
              <div className="chip-row">
                {SESSION_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="chip"
                    aria-pressed={draft.role === role}
                    onClick={() => setDraft({ ...draft, role })}
                  >
                    {SESSION_ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
              <p className="field-hint">The plan puts the vocal function work as a warm-up, a cool-down, or both.</p>
            </div>
            <IntensitySlider
              label="Vocal effort walking in"
              value={draft.effortBefore}
              onChange={(value) => setDraft({ ...draft, effortBefore: value })}
              tone="before"
              valueLabel="0 is effortless, 100 is a lot of strain"
            />
          </div>
        )}

        {currentStep === 'warmupNote' && (
          <PartStep
            kind="warmupNote"
            included={includedKinds.includes('warmupNote')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('warmupNote') && (
              <div className="editor-fields">
                <NumberField
                  label="Repetitions"
                  id="warmup-reps"
                  value={segmentOf('warmupNote')!.repetitions}
                  max={20}
                  onChange={(value) => updateSegment('warmupNote', { repetitions: value })}
                  hint="Two or three, on a comfortable high note."
                />
                <IntensitySlider
                  label="Vibration clarity"
                  value={segmentOf('warmupNote')!.clarityRating ?? 50}
                  onChange={(value) => updateSegment('warmupNote', { clarityRating: value })}
                  tone="after"
                />
                <NumberField
                  label="Voice breaks"
                  id="warmup-breaks"
                  value={segmentOf('warmupNote')!.voiceBreaks}
                  max={50}
                  onChange={(value) => updateSegment('warmupNote', { voiceBreaks: value })}
                  hint="Any clear break in the vibration you heard or felt."
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'glides' && (
          <PartStep
            kind="glides"
            included={includedKinds.includes('glides')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('glides') && (
              <div className="editor-fields">
                <div className="field">
                  <p className="field-label">Pace</p>
                  <div className="chip-row">
                    {GLIDE_PACES.map((pace) => (
                      <button
                        key={pace}
                        type="button"
                        className="chip"
                        aria-pressed={segmentOf('glides')!.glidePace === pace}
                        onClick={() =>
                          updateSegment('glides', {
                            glidePace: segmentOf('glides')!.glidePace === pace ? null : pace,
                          })
                        }
                      >
                        {GLIDE_PACE_LABELS[pace]}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">Mostly slow and steady is the plan.</p>
                </div>
                <NumberField
                  label="Register shifts noticed"
                  id="glide-shifts"
                  value={segmentOf('glides')!.registerShifts}
                  max={50}
                  onChange={(value) => updateSegment('glides', { registerShifts: value })}
                />
                {/* Shapes, utterances, and reading material all live in the one tagIds array. */}
                <TagPicker
                  kind="glideShape"
                  selectedTagIds={segmentOf('glides')!.tagIds}
                  onChange={(tagIds) => updateSegment('glides', { tagIds })}
                />
                <TagPicker
                  kind="utterance"
                  selectedTagIds={segmentOf('glides')!.tagIds}
                  onChange={(tagIds) => updateSegment('glides', { tagIds })}
                />
                <PitchFields
                  segment={segmentOf('glides')!}
                  onChange={(patch) => updateSegment('glides', patch)}
                />
                <TextField
                  label="Notes"
                  id="glide-notes"
                  value={segmentOf('glides')!.notes}
                  onChange={(value) => updateSegment('glides', { notes: value })}
                  tall
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'power' && (
          <div className="editor-fields">
            {(['powerAscending', 'powerDescending'] as const).map((kind) => (
              <PartStep
                key={kind}
                kind={kind}
                included={includedKinds.includes(kind)}
                minutesText={minutesText}
                onToggle={toggleSegment}
                onMinutesChange={setMinutes}
                recorder={recorderConfig}
              >
                {segmentOf(kind) && (
                  <div className="editor-fields">
                    <TextField
                      label="Start note"
                      id={`${kind}-start`}
                      value={segmentOf(kind)!.startNote}
                      onChange={(value) => updateSegment(kind, { startNote: value })}
                      hint="Anything that describes the pitch: a note name, a scale degree, low or high."
                    />
                    <TextField
                      label="Top note"
                      id={`${kind}-top`}
                      value={segmentOf(kind)!.topNote}
                      onChange={(value) => updateSegment(kind, { topNote: value })}
                    />
                    <TextField
                      label="Bottom note"
                      id={`${kind}-bottom`}
                      value={segmentOf(kind)!.bottomNote}
                      onChange={(value) => updateSegment(kind, { bottomNote: value })}
                    />
                    <NumberField
                      label="Notes climbed"
                      id={`${kind}-climbed`}
                      value={segmentOf(kind)!.notesClimbed}
                      max={40}
                      onChange={(value) => updateSegment(kind, { notesClimbed: value })}
                      hint="Five to eight is the target before stopping at a comfortable high note."
                    />
                    <NumberField
                      label="Longest sustain (seconds)"
                      id={`${kind}-sustain`}
                      value={segmentOf(kind)!.longestSustainSeconds}
                      max={600}
                      onChange={(value) => updateSegment(kind, { longestSustainSeconds: value })}
                      hint="The plan asks for 5 to 8 seconds per step."
                    />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={segmentOf(kind)!.identifiedComfortableRange}
                        onChange={(event) => updateSegment(kind, { identifiedComfortableRange: event.target.checked })}
                      />
                      <span>Marked a comfortable speaking range</span>
                    </label>
                    <PitchFields segment={segmentOf(kind)!} onChange={(patch) => updateSegment(kind, patch)} />
                    <TextField
                      label="Notes"
                      id={`${kind}-notes`}
                      value={segmentOf(kind)!.notes}
                      onChange={(value) => updateSegment(kind, { notes: value })}
                      tall
                    />
                  </div>
                )}
              </PartStep>
            ))}
          </div>
        )}

        {currentStep === 'stretchAndFlow' && (
          <PartStep
            kind="stretchAndFlow"
            included={includedKinds.includes('stretchAndFlow')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('stretchAndFlow') && (
              <div className="editor-fields">
                <StretchAndFlowFields
                  segment={segmentOf('stretchAndFlow')!}
                  onChange={(patch) => updateSegment('stretchAndFlow', patch)}
                />
                <IntensitySlider
                  label="Breathing and phonation together"
                  value={segmentOf('stretchAndFlow')!.coordinationRating ?? 50}
                  onChange={(value) => updateSegment('stretchAndFlow', { coordinationRating: value })}
                  tone="after"
                />
                <TextField
                  label="Notes"
                  id="sf-notes"
                  value={segmentOf('stretchAndFlow')!.notes}
                  onChange={(value) => updateSegment('stretchAndFlow', { notes: value })}
                  tall
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'resonance' && (
          <PartStep
            kind="resonance"
            included={includedKinds.includes('resonance')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('resonance') && (
              <div className="editor-fields">
                <ResonanceFields
                  segment={segmentOf('resonance')!}
                  onChange={(patch) => updateSegment('resonance', patch)}
                />
                <TagPicker
                  kind="utterance"
                  selectedTagIds={segmentOf('resonance')!.tagIds}
                  onChange={(tagIds) => updateSegment('resonance', { tagIds })}
                />
                <TextField
                  label="Notes"
                  id="resonance-notes"
                  value={segmentOf('resonance')!.notes}
                  onChange={(value) => updateSegment('resonance', { notes: value })}
                  tall
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'carryover' && (
          <PartStep
            kind="carryover"
            included={includedKinds.includes('carryover')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('carryover') && (
              <div className="editor-fields">
                <CarryoverFields
                  segment={segmentOf('carryover')!}
                  onChange={(patch) => updateSegment('carryover', patch)}
                />
                <TextField
                  label="Notes"
                  id="carryover-notes"
                  value={segmentOf('carryover')!.notes}
                  onChange={(value) => updateSegment('carryover', { notes: value })}
                  tall
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'endurance' && (
          <PartStep
            kind="endurance"
            included={includedKinds.includes('endurance')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
            recorder={recorderConfig}
          >
            {segmentOf('endurance') && (
              <div className="editor-fields">
                <TagPicker
                  kind="material"
                  selectedTagIds={segmentOf('endurance')!.tagIds}
                  onChange={(tagIds) => updateSegment('endurance', { tagIds })}
                />
                <IntensitySlider
                  label="Pace"
                  value={segmentOf('endurance')!.paceRating ?? 50}
                  onChange={(value) => updateSegment('endurance', { paceRating: value })}
                  tone="before"
                />
                <IntensitySlider
                  label="Fatigue by the end"
                  value={segmentOf('endurance')!.fatigueRating ?? 50}
                  onChange={(value) => updateSegment('endurance', { fatigueRating: value })}
                  tone="after"
                />
                <TextField
                  label="Notes"
                  id="endurance-notes"
                  value={segmentOf('endurance')!.notes}
                  onChange={(value) => updateSegment('endurance', { notes: value })}
                  tall
                />
              </div>
            )}
          </PartStep>
        )}

        {currentStep === 'finish' && (
          <div className="editor-fields">
            <p className="helper">
              {totalMinutes > 0
                ? `About ${Math.round(totalMinutes)} minutes across ${draft.segments.length} ${draft.segments.length === 1 ? 'part' : 'parts'}.`
                : 'No time recorded yet. Use Back to add minutes to any part.'}
            </p>
            <IntensitySlider
              label="Vocal effort now"
              value={draft.effortAfter ?? draft.effortBefore}
              earlierValue={draft.effortBefore}
              onChange={(value) => setDraft({ ...draft, effortAfter: value })}
              tone="after"
            />
            <p className="field-hint">
              One way to get a number here: rate how much effort it takes to speak right now, using the same 0-100 scale.
            </p>
            {(['focus', 'win', 'watch'] as TagKind[]).map((tagKind) => (
              <TagPicker
                key={tagKind}
                kind={tagKind}
                selectedTagIds={tagIdsFor(tagKind)}
                onChange={(tagIds) => setTagIds(tagKind, tagIds)}
              />
            ))}
            <TextField
              label="Notes for your SLP"
              id="slp-note"
              value={draft.slpNote}
              onChange={(value) => setDraft({ ...draft, slpNote: value })}
              tall
              hint="Anything you want to bring up next session. This travels with the report."
            />
            {error && <p className="form-error">{error}</p>}
            <div className="finish-actions">
              <button type="button" className="button button-secondary" disabled={isBusy} onClick={() => void save('draft')}>
                Save as draft
              </button>
              <button type="submit" className="button button-primary" disabled={isBusy}>
                {isBusy ? 'Saving...' : 'Save session'}
              </button>
            </div>
          </div>
        )}
      </div>

      {currentStep !== 'finish' && (
        <div className="editor-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
            disabled={stepIndex === 0}
          >
            Back
          </button>
          <button type="submit" className="button button-primary">
            Next
          </button>
        </div>
      )}
    </form>
  )
}

interface PartRecorderConfig {
  sessionId: string | null
  ensureSessionId: () => Promise<string | null>
  recordings: Recording[]
  onChanged: () => void
}

interface PartStepProps {
  kind: SegmentKind
  included: boolean
  minutesText: Record<string, string>
  onToggle: (kind: SegmentKind, included: boolean) => void
  onMinutesChange: (kind: SegmentKind, text: string) => void
  recorder?: PartRecorderConfig
  children?: ReactNode
}

/** Wrapper every protocol part shares: skip toggle, the plan's own wording, minutes. */
function PartStep({ kind, included, minutesText, onToggle, onMinutesChange, recorder, children }: PartStepProps) {
  const definition = SEGMENT_DEFINITIONS[kind]
  return (
    <section className="part-step">
      <div className="part-step-header">
        <div>
          <h3>{definition.label}</h3>
          <p className="part-step-summary">{definition.summary}</p>
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={included} onChange={(event) => onToggle(kind, event.target.checked)} />
          <span>Doing this today</span>
        </label>
      </div>
      <details className="helper">
        <summary>From the plan</summary>
        <ul>
          {definition.guidance.map((guidanceLine) => (
            <li key={guidanceLine}>{guidanceLine}</li>
          ))}
        </ul>
      </details>
      {included ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor={`minutes-${kind}`}>
              Minutes
            </label>
            <input
              id={`minutes-${kind}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={180}
              step={0.5}
              value={minutesText[kind] ?? ''}
              placeholder="0"
              onChange={(event) => onMinutesChange(kind, event.target.value)}
            />
          </div>
          {children}
          {recorder && <StepRecorder kind={kind} {...recorder} />}
        </>
      ) : (
        <p className="empty-hint">Skipped today.</p>
      )}
    </section>
  )
}

interface NumberFieldProps {
  label: string
  id: string
  value: number | null
  max: number
  onChange: (value: number | null) => void
  hint?: string
}

/** Blank means "not recorded" (null), so the CSV and the charts can tell it from a zero. */
function NumberField({ label, id, value, max, onChange, hint }: NumberFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const { value: text } = event.target
          if (text === '') {
            onChange(null)
            return
          }
          const parsed = Number.parseInt(text, 10)
          onChange(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : null)
        }}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

interface TextFieldProps {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  hint?: string
  tall?: boolean
}

function TextField({ label, id, value, onChange, hint, tall }: TextFieldProps) {
  const shared = {
    id,
    value,
    maxLength: 10_000,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  }
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {tall ? <textarea {...shared} /> : <input type="text" {...shared} />}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

/**
 * The guided Stretch and Flow flow (spec 7.1). Stage selection drives the ratio
 * and phase number; the step, cue, pacing, toggle, and carryover inputs record
 * what was actually done. Semantic HTML first (R5.3): fieldset/legend for the
 * checklists, native checkbox/number/select inputs, no custom widgets.
 */
function StretchAndFlowFields({
  segment,
  onChange,
}: {
  segment: SessionSegmentInput
  onChange: (patch: Partial<SessionSegmentInput>) => void
}) {
  const detail: StretchAndFlowDetail = segment.stretchAndFlow ?? createEmptyStretchAndFlowDetail()
  const stage: StretchAndFlowStage | undefined = detail.stageId ? STRETCH_AND_FLOW_STAGE_BY_ID.get(detail.stageId) : undefined
  const legacyPhase =
    segment.phaseNumber !== null && segment.phaseNumber > LAST_STRETCH_AND_FLOW_PHASE ? segment.phaseNumber : null
  const carryover: StretchAndFlowCarryoverLog = detail.carryover ?? { kind: null, itemIds: [], customText: '' }
  const [breathCountNotice, setBreathCountNotice] = useState<Record<string, string>>({})

  const updateDetail = (patch: Partial<StretchAndFlowDetail>) => onChange({ stretchAndFlow: { ...detail, ...patch } })

  const selectStage = (nextStage: StretchAndFlowStage) => {
    // Ratio is derived from the stage, never picked independently (spec 4.3).
    // usedTissue is left as recorded: choosing a stage is not an observation
    // that the tissue was used (spec 3.2 - null when not recorded).
    // Steps are preserved by id across stages that share the five-step shape.
    // A stage whose steps are not printed (Phase 4) keeps whatever was already
    // entered rather than discarding it (N6).
    const steps =
      nextStage.stepIds.length === 0
        ? detail.steps
        : nextStage.stepIds.map((stepId) => {
            const existing = detail.steps.find((step) => step.stepId === stepId)
            return existing ?? { stepId, completed: false, breathCount: null }
          })
    // The "Toggle 1 & 2" note belongs to Phase 1 and Phase 2 (ADR-0002); clear
    // the toggle on any other stage.
    const togglesAirOnlyAndVoiced = nextStage.id === 'phase1' || nextStage.id === 'phase2'
    onChange({
      phaseNumber: nextStage.phaseNumber,
      stretchAndFlow: {
        ...detail,
        stageId: nextStage.id,
        ratio: nextStage.ratio,
        toggledAirOnlyAndVoiced: togglesAirOnlyAndVoiced ? detail.toggledAirOnlyAndVoiced : null,
        steps,
      },
    })
  }

  const setStepProgress = (stepId: string, patch: Partial<StretchAndFlowStepProgress>) => {
    const existing = detail.steps.find((step) => step.stepId === stepId)
    const steps = existing
      ? detail.steps.map((step) => (step.stepId === stepId ? { ...step, ...patch } : step))
      : [...detail.steps, { stepId, completed: false, breathCount: null, ...patch }]
    updateDetail({ steps })
  }

  const updateCarryover = (patch: Partial<StretchAndFlowCarryoverLog>) => {
    updateDetail({ carryover: { ...carryover, ...patch } })
  }

  return (
    <>
      <fieldset className="field" aria-describedby="sf-stage-summary">
        <legend className="field-label">Stage</legend>
        <div className="radio-row">
          {STRETCH_AND_FLOW_STAGES.map((candidate) => (
            <label key={candidate.id} className="radio-chip">
              <input
                type="radio"
                name="sf-stage"
                value={candidate.id}
                checked={detail.stageId === candidate.id}
                onChange={() => selectStage(candidate)}
              />
              <span>{candidate.label}</span>
            </label>
          ))}
          {legacyPhase !== null && (
            <label className="radio-chip is-disabled">
              <input type="radio" name="sf-stage" value={`legacy-${legacyPhase}`} disabled checked={false} readOnly />
              <span>Phase {legacyPhase} (not in the current handout)</span>
            </label>
          )}
        </div>
        {stage ? (
          <p className="field-hint" id="sf-stage-summary">
            {stage.ratioLabel ?? 'Progression guidance (no voicing ratio)'}
            {stage.tissue === 'required'
              ? ' - tissue: still with tissue'
              : stage.tissue === 'optional'
                ? ' - tissue: optional'
                : ''}
          </p>
        ) : (
          <p className="field-hint" id="sf-stage-summary">
            Pick a stage to see its steps, ratio, and cues.
          </p>
        )}
      </fieldset>

      {stage && (
        <fieldset className="field">
          <legend className="field-label">Used the tissue this session</legend>
          <div className="radio-row">
            {(
              [
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Not recorded' },
              ] as const
            ).map((option) => (
              <label key={option.label} className="radio-chip">
                <input
                  type="radio"
                  name="sf-tissue"
                  checked={detail.usedTissue === option.value}
                  onChange={() => updateDetail({ usedTissue: option.value })}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {stage?.stepsNotPrinted ? (
        <div className="sf-not-printed">
          <p className="field-hint">Steps not printed in the handout.</p>
          {stage.guidance.length > 0 && (
            <ul className="guidance-list">
              {stage.guidance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        stage && (
          <fieldset className="sf-steps">
            <legend>Steps</legend>
            {STRETCH_AND_FLOW_STEPS.map((step) => {
              const progress = detail.steps.find((candidate) => candidate.stepId === step.id)
              const completed = progress?.completed ?? false
              const breathCount = progress?.breathCount ?? null
              const rangeHint = step.countRange ? `Count ${step.countRange.min}-${step.countRange.max}` : ''
              const notice = breathCountNotice[step.id]
              return (
                <div key={step.id} className="sf-step-row">
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={completed}
                      onChange={(event) => setStepProgress(step.id, { completed: event.target.checked })}
                    />
                    <span>{stretchAndFlowStepLabel(step, stage)}</span>
                  </label>
                  {step.countRange && (
                    <div className="field">
                      <label className="field-label" htmlFor={`sf-breath-${step.id}`}>
                        Breath count for {step.label}
                      </label>
                      <input
                        id={`sf-breath-${step.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={breathCount === null ? '' : String(breathCount)}
                        aria-describedby={`sf-breath-hint-${step.id}${notice ? ` sf-breath-error-${step.id}` : ''}`}
                        aria-invalid={notice ? true : undefined}
                        onChange={(event) => {
                          // The parsed value is stored unclamped, so the field
                          // shows exactly what was typed and the error state
                          // matches it (N1).
                          const { value: nextBreathCount, error: nextNotice } = parseBreathCountInput(event.target.value)
                          setBreathCountNotice((previous) => {
                            if (nextNotice === null) {
                              if (!(step.id in previous)) return previous
                              const next = { ...previous }
                              delete next[step.id]
                              return next
                            }
                            return { ...previous, [step.id]: nextNotice }
                          })
                          setStepProgress(step.id, { breathCount: nextBreathCount })
                        }}
                      />
                      <p className="field-hint" id={`sf-breath-hint-${step.id}`}>
                        {rangeHint}
                      </p>
                      {notice && (
                        <p className="field-error" id={`sf-breath-error-${step.id}`} role="status">
                          {notice}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </fieldset>
        )
      )}

      <fieldset className="sf-cues">
        <legend>Cues</legend>
        {STRETCH_AND_FLOW_CUES.map((cue) => (
          <label key={cue.id} className="checkbox-field">
            <input
              type="checkbox"
              checked={detail.cuesChecked.includes(cue.id)}
              onChange={(event) => {
                const cuesChecked = event.target.checked
                  ? [...detail.cuesChecked, cue.id]
                  : detail.cuesChecked.filter((cueId) => cueId !== cue.id)
                updateDetail({ cuesChecked })
              }}
            />
            <span>{cue.text}</span>
          </label>
        ))}
      </fieldset>

      {/* Safety copy is rendered visibly, not in a tooltip (spec 8, R5.7). */}
      <aside className="sf-pacing" aria-labelledby="sf-pacing-heading">
        <h4 id="sf-pacing-heading">Pacing and safety</h4>
        <ul>
          {STRETCH_AND_FLOW_PACING.filter(
            // "Toggle 1 & 2" is the Phase 1/Phase 2 air-only/voiced toggle; it
            // does not apply to the other stages.
            (item) =>
              item.id !== 'toggleInstruction' || stage?.id === 'phase1' || stage?.id === 'phase2',
          ).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </aside>

      {(stage?.id === 'phase1' || stage?.id === 'phase2') && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={detail.toggledAirOnlyAndVoiced ?? false}
            onChange={(event) => updateDetail({ toggledAirOnlyAndVoiced: event.target.checked })}
          />
          <span>Toggled between air-only and voiced productions</span>
        </label>
      )}

      <fieldset className="sf-carryover">
        <legend>Carryover</legend>
        <div className="field">
          <label className="field-label" htmlFor="sf-carryover-kind">
            Carryover kind
          </label>
          <select
            id="sf-carryover-kind"
            value={carryover.kind ?? ''}
            onChange={(event) =>
              updateCarryover({
                kind: (event.target.value === '' ? null : event.target.value) as StretchAndFlowCarryoverKind | null,
                itemIds: [],
              })
            }
          >
            <option value="">Not recorded</option>
            {STRETCH_AND_FLOW_CARRYOVER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        {carryover.kind && (
          <fieldset className="sf-carryover-items">
            <legend>Items</legend>
            {STRETCH_AND_FLOW_CARRYOVER.filter((item) => item.kind === carryover.kind).map((item) => (
              <label key={item.id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={carryover.itemIds.includes(item.id)}
                  onChange={(event) => {
                    const itemIds = event.target.checked
                      ? [...carryover.itemIds, item.id]
                      : carryover.itemIds.filter((itemId) => itemId !== item.id)
                    updateCarryover({ itemIds })
                  }}
                />
                <span>{item.text}</span>
              </label>
            ))}
          </fieldset>
        )}
        <TextField
          label="Carryover notes"
          id="sf-carryover-text"
          value={carryover.customText}
          onChange={(value) => updateCarryover({ customText: value })}
          hint="Daily phrases, how-to stories, or conversation topics you used."
          tall
        />
      </fieldset>
    </>
  )
}

/**
 * A frequency field. The stored value is Hz; the note name is derived for
 * display, never stored (ADR-0003). Out-of-range input is clamped to the
 * schema's 0-2000 band so the stored value and the field agree.
 */
function HzField({
  label,
  id,
  value,
  onChange,
  hint,
}: {
  label: string
  id: string
  value: number | null
  onChange: (value: number | null) => void
  hint?: string
}) {
  const noteName = value !== null && value > 0 ? noteNameForHz(value) : null
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={2000}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const { value: text } = event.target
          if (text === '') {
            onChange(null)
            return
          }
          const parsed = Number.parseInt(text, 10)
          onChange(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 2000) : null)
        }}
      />
      <p className="field-hint">
        {noteName ? `About ${noteName}` : 'In Hz, from your pitch monitor.'}
        {hint ? ` ${hint}` : ''}
      </p>
    </div>
  )
}

/** The VFE pitch fields: high, low, and the chosen ideal-speaking-range low note. */
function PitchFields({
  segment,
  onChange,
}: {
  segment: SessionSegmentInput
  onChange: (patch: Partial<SessionSegmentInput>) => void
}) {
  const pitch: PitchWorkInput = segment.pitch ?? createEmptyPitchWork()
  const [start, octaveDown] = VFE_PITCH_TARGETS
  const updatePitch = (patch: Partial<PitchWorkInput>) => onChange({ pitch: { ...pitch, ...patch } })

  return (
    <fieldset className="pitch-fields">
      <legend className="field-label">Pitch</legend>
      <p className="field-hint">
        The plan anchors: start at about {Math.round(start!.hz)} Hz ({start!.noteName}), down the octave to about{' '}
        {Math.round(octaveDown!.hz)} Hz ({octaveDown!.noteName}).
      </p>
      <HzField label="High note" id="pitch-high" value={pitch.highHz} onChange={(value) => updatePitch({ highHz: value })} />
      <HzField label="Low note" id="pitch-low" value={pitch.lowHz} onChange={(value) => updatePitch({ lowHz: value })} />
      <HzField
        label="Speaking-range low note"
        id="pitch-speaking-low"
        value={pitch.speakingRangeLowHz}
        onChange={(value) => updatePitch({ speakingRangeLowHz: value })}
        hint="Where you want your low note to sit. The plan sets no target for this one."
      />
    </fieldset>
  )
}

/** The Resonance ladder, comfortable pitch, sentences, and intonation passes. */
function ResonanceFields({
  segment,
  onChange,
}: {
  segment: SessionSegmentInput
  onChange: (patch: Partial<SessionSegmentInput>) => void
}) {
  const detail: ResonanceDetail = segment.resonance ?? createEmptyResonanceDetail()
  const update = (patch: Partial<ResonanceDetail>) => onChange({ resonance: { ...detail, ...patch } })

  const setStep = (stepId: string, completed: boolean) => {
    const existing = detail.steps.find((step) => step.stepId === stepId)
    const steps = existing
      ? detail.steps.map((step) => (step.stepId === stepId ? { ...step, completed } : step))
      : [...detail.steps, { stepId, completed }]
    update({ steps })
  }

  return (
    <>
      <fieldset className="sf-steps">
        <legend>Ladder</legend>
        {RESONANCE_STEPS.map((step) => (
          <label key={step.id} className="checkbox-field">
            <input
              type="checkbox"
              checked={detail.steps.find((candidate) => candidate.stepId === step.id)?.completed ?? false}
              onChange={(event) => setStep(step.id, event.target.checked)}
            />
            <span>{step.label}</span>
          </label>
        ))}
      </fieldset>

      <HzField
        label="Comfortable pitch"
        id="resonance-pitch"
        value={detail.comfortablePitchHz}
        onChange={(value) => update({ comfortablePitchHz: value })}
        hint="The pitch you settled on with the monitor."
      />

      <fieldset className="sf-cues">
        <legend>Sentences</legend>
        {RESONANCE_SENTENCES.map((sentence) => (
          <label key={sentence.id} className="checkbox-field">
            <input
              type="checkbox"
              checked={detail.sentenceIds.includes(sentence.id)}
              onChange={(event) =>
                update({
                  sentenceIds: event.target.checked
                    ? [...detail.sentenceIds, sentence.id]
                    : detail.sentenceIds.filter((sentenceId) => sentenceId !== sentence.id),
                })
              }
            />
            <span>{sentence.text}</span>
          </label>
        ))}
      </fieldset>

      <NumberField
        label="Intonation repetitions"
        id="resonance-intonation"
        value={detail.intonationRepetitions}
        max={100}
        onChange={(value) => update({ intonationRepetitions: value })}
        hint="How many passes you did. The plan says as many as you need."
      />
    </>
  )
}

/** Carry-Over: conversations, contexts, and whether a warm-up came first. */
function CarryoverFields({
  segment,
  onChange,
}: {
  segment: SessionSegmentInput
  onChange: (patch: Partial<SessionSegmentInput>) => void
}) {
  const detail: CarryoverDetail = segment.carryover ?? createEmptyCarryoverDetail()
  const update = (patch: Partial<CarryoverDetail>) => onChange({ carryover: { ...detail, ...patch } })

  return (
    <>
      <NumberField
        label="Conversations this session"
        id="carryover-count"
        value={detail.conversationCount}
        max={20}
        onChange={(value) => update({ conversationCount: value })}
        hint={`The plan asks for ${CARRYOVER_WEEKLY_CONVERSATION_TARGET} conversations a week. Log however many you did.`}
      />
      <fieldset className="sf-cues">
        <legend>Context</legend>
        {CARRYOVER_CONTEXTS.map((context) => (
          <label key={context.id} className="checkbox-field">
            <input
              type="checkbox"
              checked={detail.contextIds.includes(context.id)}
              onChange={(event) =>
                update({
                  contextIds: event.target.checked
                    ? [...detail.contextIds, context.id]
                    : detail.contextIds.filter((contextId) => contextId !== context.id),
                })
              }
            />
            <span>{context.text}</span>
          </label>
        ))}
      </fieldset>
      <TextField
        label="Other context"
        id="carryover-other"
        value={detail.customContext}
        onChange={(value) => update({ customContext: value })}
        hint="Anything not in the list."
      />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={detail.warmedUpBefore ?? false}
          onChange={(event) => update({ warmedUpBefore: event.target.checked })}
        />
        <span>Warmed up before the conversation</span>
      </label>
    </>
  )
}
