import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api'
import { navigateTo } from '../router'
import { useSessionData } from '../sessionData'
import { IntensitySlider } from '../components/IntensitySlider'
import { TagPicker } from '../components/TagPicker'
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../format'
import {
  GLIDE_PACES,
  GLIDE_PACE_LABELS,
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
  createEmptySegmentInput,
  createEmptySessionInput,
  createEmptyStretchAndFlowDetail,
  parseBreathCountInput,
  sortSegmentsByProtocolOrder,
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
  LAST_STRETCH_AND_FLOW_PHASE,
  SEGMENT_DEFINITIONS,
  STRETCH_AND_FLOW_CARRYOVER,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_PACING,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  STRETCH_AND_FLOW_STAGES,
  STRETCH_AND_FLOW_STEPS,
  stretchAndFlowStepLabel,
  type SegmentKind,
  type StretchAndFlowStage,
} from '../../shared/protocol'

const EDITOR_STEPS = ['start', 'warmupNote', 'glides', 'power', 'stretchAndFlow', 'endurance', 'finish'] as const
type EditorStep = (typeof EDITOR_STEPS)[number]

const STEP_LABELS: Record<EditorStep, string> = {
  start: 'Start',
  warmupNote: 'Warm-up',
  glides: 'Glides',
  power: 'POWER',
  stretchAndFlow: 'Stretch',
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

export function SessionEditor({ existingSession }: { existingSession?: Session }) {
  const { refresh } = useSessionData()
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

  const save = async (status: SessionStatus) => {
    setIsBusy(true)
    setError(null)
    try {
      const payload: SessionInput = { ...draft, status }
      const savedSession = savedSessionId
        ? await api.replaceSession(savedSessionId, payload)
        : await api.createSession(payload)
      setSavedSessionId(savedSession.id)
      await refresh()
      navigateTo(`/sessions/${savedSession.id}`, { replace: true })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this session.')
      setIsBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (stepIndex < EDITOR_STEPS.length - 1) setStepIndex(stepIndex + 1)
    else void save('complete')
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="editor-bar">
        <button
          type="button"
          className="button button-quiet"
          onClick={() => navigateTo(savedSessionId ? `/sessions/${savedSessionId}` : '/sessions')}
        >
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

        {currentStep === 'endurance' && (
          <PartStep
            kind="endurance"
            included={includedKinds.includes('endurance')}
            minutesText={minutesText}
            onToggle={toggleSegment}
            onMinutesChange={setMinutes}
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

interface PartStepProps {
  kind: SegmentKind
  included: boolean
  minutesText: Record<string, string>
  onToggle: (kind: SegmentKind, included: boolean) => void
  onMinutesChange: (kind: SegmentKind, text: string) => void
  children?: ReactNode
}

/** Wrapper every protocol part shares: skip toggle, the plan's own wording, minutes. */
function PartStep({ kind, included, minutesText, onToggle, onMinutesChange, children }: PartStepProps) {
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
    // A stage whose steps are not printed (Phase 2/3) keeps whatever was already
    // entered rather than discarding it (N6).
    const steps =
      nextStage.stepIds.length === 0
        ? detail.steps
        : nextStage.stepIds.map((stepId) => {
            const existing = detail.steps.find((step) => step.stepId === stepId)
            return existing ?? { stepId, completed: false, breathCount: null }
          })
    onChange({
      phaseNumber: nextStage.phaseNumber,
      stretchAndFlow: {
        ...detail,
        stageId: nextStage.id,
        ratio: nextStage.ratio,
        // The Phase 4 toggle only applies to Phase 4; clear it otherwise.
        toggledAirOnlyAndVoiced: nextStage.id === 'phase4' ? detail.toggledAirOnlyAndVoiced : null,
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
            {stage.ratioLabel ?? 'Voicing ratio not printed in the handout'}
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
            // "Toggle 1 & 2" is the Phase 4 air-only/voiced toggle; it does not
            // apply to the other stages.
            (item) => item.id !== 'toggleInstruction' || stage?.id === 'phase4',
          ).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </aside>

      {stage?.id === 'phase4' && (
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
