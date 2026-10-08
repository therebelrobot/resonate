import type { DailyTrendPoint } from '../../shared/metrics'
import { PRACTICE_TRACKS, TRACK_DEFINITIONS, type PracticeTrack } from '../../shared/protocol'

const TRACK_FILL_CLASS: Record<PracticeTrack, string> = {
  vocalFunction: 'chart-fill-vfe',
  stretchAndFlow: 'chart-fill-stretch',
  endurance: 'chart-fill-endurance',
}

function minutesOfTrack(point: DailyTrendPoint, track: PracticeTrack): number {
  if (track === 'vocalFunction') return point.vocalFunctionMinutes
  if (track === 'stretchAndFlow') return point.stretchAndFlowMinutes
  return point.enduranceMinutes
}

interface StackedSegment {
  track: PracticeTrack
  y: number
  height: number
}

interface StackedBar {
  dayKey: string
  x: number
  width: number
  segments: StackedSegment[]
}

/**
 * Daily minutes, stacked by track, drawn in a 0-100 viewBox with
 * preserveAspectRatio="none" so the SVG stretches to whatever width the CSS gives
 * it. The reference line is the tallest single-session target in the plan, which
 * varies per track - so it is passed in rather than assumed.
 */
export function DailyMinutesChart({ points, referenceMinutes }: { points: DailyTrendPoint[]; referenceMinutes: number }) {
  const peakMinutes = Math.max(referenceMinutes, ...points.map((point) => point.totalMinutes), 1)
  const slotWidth = 100 / Math.max(points.length, 1)
  const barWidth = slotWidth * 0.66

  const bars: StackedBar[] = points.map((point, index) => {
    const segments: StackedSegment[] = []
    let stackedHeight = 0
    for (const track of PRACTICE_TRACKS) {
      const trackMinutes = minutesOfTrack(point, track)
      if (trackMinutes <= 0) continue
      const height = (trackMinutes / peakMinutes) * 100
      segments.push({ track, y: 100 - stackedHeight - height, height })
      stackedHeight += height
    }
    return { dayKey: point.dayKey, x: index * slotWidth + (slotWidth - barWidth) / 2, width: barWidth, segments }
  })

  const referenceY = 100 - (referenceMinutes / peakMinutes) * 100

  return (
    <figure className="chart">
      <svg
        className="chart-svg chart-svg-bars"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Minutes practiced per day over the last ${points.length} days`}
      >
        <line className="chart-reference-line" x1="0" x2="100" y1={referenceY} y2={referenceY} />
        {bars.map((bar) => (
          <g key={bar.dayKey}>
            {bar.segments.map((segment) => (
              <rect
                key={segment.track}
                className={TRACK_FILL_CLASS[segment.track]}
                x={bar.x}
                y={segment.y}
                width={bar.width}
                height={Math.max(segment.height, 0.6)}
              />
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="chart-legend">
        {PRACTICE_TRACKS.map((track) => (
          <span key={track} className="chart-legend-item">
            <span className={`chart-swatch ${TRACK_FILL_CLASS[track]}`} aria-hidden="true" />
            {TRACK_DEFINITIONS[track].shortLabel}
          </span>
        ))}
        <span className="chart-legend-note">dashed line: {referenceMinutes} min</span>
      </figcaption>
    </figure>
  )
}

interface TrendLineChartProps {
  values: (number | null)[]
  ariaLabel: string
  /** Set when a lower number is the better outcome, so the caption says so. */
  lowerIsBetter?: boolean
  minimum?: number
  maximum?: number
}

/** A line that breaks wherever a day has no data, rather than drawing through zero. */
export function TrendLineChart({ values, ariaLabel, lowerIsBetter, minimum, maximum }: TrendLineChartProps) {
  const definedValues = values.filter((value): value is number => value !== null)
  if (definedValues.length < 2) {
    return <p className="empty-hint">Not enough sessions with this measurement yet to draw a trend.</p>
  }

  const lowestValue = minimum ?? Math.min(...definedValues)
  const highestValue = maximum ?? Math.max(...definedValues)
  const valueSpan = highestValue - lowestValue || 1
  const step = values.length > 1 ? 100 / (values.length - 1) : 100

  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  const dots: { x: number; y: number }[] = []
  let previousPoint: { x: number; y: number } | null = null

  values.forEach((value, index) => {
    if (value === null) {
      previousPoint = null
      return
    }
    const point = { x: index * step, y: 100 - ((value - lowestValue) / valueSpan) * 100 }
    dots.push(point)
    if (previousPoint) segments.push({ x1: previousPoint.x, y1: previousPoint.y, x2: point.x, y2: point.y })
    previousPoint = point
  })

  return (
    <figure className="chart">
      <svg className="chart-svg chart-svg-line" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {segments.map((segment) => (
          <line
            key={`${segment.x1}-${segment.y1}-${segment.x2}`}
            className="chart-line"
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
          />
        ))}
        {dots.map((dot) => (
          <circle key={`${dot.x}-${dot.y}`} className="chart-dot" cx={dot.x} cy={dot.y} r="1.6" />
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span className="chart-legend-note">
          {definedValues.length} of {values.length} days with data
          {lowerIsBetter ? ' - lower is better' : ''}
        </span>
      </figcaption>
    </figure>
  )
}
