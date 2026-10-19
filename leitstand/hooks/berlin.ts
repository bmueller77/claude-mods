// Björn reads every time in Berlin time, on servers and in the cloud that run on UTC too.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const BERLIN = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    return null
  }
})()

/** A moment as Berlin's wall clock shows it: month 1 to 12, weekday 0 for Sunday as getDay() counts. */
export type BerlinTime = { year: number; month: number; date: number; weekday: number; hours: number; minutes: number; seconds: number }

/** A moment in Berlin time; the machine's own where the runtime has no time zone data. */
export function inBerlin(at: number): BerlinTime {
  const local = new Date(at)
  if (BERLIN !== null) {
    const parts: Record<string, string> = {}
    for (const part of BERLIN.formatToParts(local)) parts[part.type] = part.value
    const time = {
      year: Number(parts.year),
      month: Number(parts.month),
      date: Number(parts.day),
      weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
      hours: Number(parts.hour) % 24,
      minutes: Number(parts.minute),
      seconds: Number(parts.second),
    }
    if (time.weekday >= 0 && Object.values(time).every(Number.isFinite)) return time
  }
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    date: local.getDate(),
    weekday: local.getDay(),
    hours: local.getHours(),
    minutes: local.getMinutes(),
    seconds: local.getSeconds(),
  }
}
