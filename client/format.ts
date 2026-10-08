const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
const dayWithYearFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function formatTime(isoTimestamp: string): string {
  return timeFormatter.format(new Date(isoTimestamp))
}

export function formatDayHeading(date: Date, now = new Date()): string {
  const dayDifference = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  )
  if (dayDifference === 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  return date.getFullYear() === now.getFullYear() ? dayFormatter.format(date) : dayWithYearFormatter.format(date)
}

export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date)
}

export function formatFullTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  return `${formatDayHeading(date)}, ${timeFormatter.format(date)}`
}

/** For <input type="datetime-local">, which wants local wall-clock time without an offset. */
export function toDateTimeLocalValue(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocalValue(localValue: string): string {
  const parsedDate = new Date(localValue)
  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString()
}

export function formatRating(value: number | null): string {
  return value === null ? '-' : String(Math.round(value))
}

/** Minutes as a short label: under a minute reads in seconds, so 0.5 is not "0 min". */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 min'
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  const roundedMinutes = minutes < 10 ? Math.round(minutes * 10) / 10 : Math.round(minutes)
  return `${roundedMinutes} min`
}

export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '-'
  return `${Math.round(seconds)}s`
}

export function formatPercent(fraction: number | null, fractionDigits = 0): string {
  if (fraction === null) return '-'
  return `${(fraction * 100).toFixed(fractionDigits)}%`
}

export function formatSigned(value: number | null, fractionDigits = 0): string {
  if (value === null) return '-'
  const rounded = value.toFixed(fractionDigits)
  return value > 0 ? `+${rounded}` : rounded
}
