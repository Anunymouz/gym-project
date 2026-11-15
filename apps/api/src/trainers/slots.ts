import { BOOKING_HORIZON_DAYS, MIN_NOTICE_MINUTES, SLOT_STEP_MINUTES, timeToMinutes, type DaySlots } from '@bgym/shared';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface SlotInput {
  /** Weekly hours, in Accra time (= UTC, no daylight saving). */
  rules: Array<{ weekday: number; startTime: string; endTime: string }>;
  /** Days off, whole (no times) or part of a day. */
  timeOff: Array<{ date: Date; startTime: string | null; endTime: string | null }>;
  /** Live bookings (confirmed, or unpaid holds that haven't expired). */
  busy: Array<{ startsAt: Date; endsAt: Date }>;
  durationMin: number;
  /** First day to list (YYYY-MM-DD) and how many days. */
  from: string;
  days: number;
  now: Date;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/**
 * Free session start times per day: the trainer's weekly hours, minus time off and other
 * bookings, starting every 30 minutes, at least 2 hours from now and within 30 days.
 */
export function freeSlots(input: SlotInput): DaySlots[] {
  const earliest = input.now.getTime() + MIN_NOTICE_MINUTES * MINUTE;
  const latest = input.now.getTime() + BOOKING_HORIZON_DAYS * DAY;
  const length = input.durationMin * MINUTE;
  const first = Date.parse(`${input.from}T00:00:00Z`);
  const out: DaySlots[] = [];

  for (let d = 0; d < input.days; d++) {
    const dayStart = first + d * DAY;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const weekday = new Date(dayStart).getUTCDay();
    const off = input.timeOff.filter((t) => t.date.toISOString().slice(0, 10) === date);
    const slots: DaySlots['slots'] = [];
    if (!off.some((t) => !t.startTime)) {
      for (const rule of input.rules.filter((r) => r.weekday === weekday)) {
        const open = dayStart + timeToMinutes(rule.startTime) * MINUTE;
        const close = dayStart + timeToMinutes(rule.endTime) * MINUTE;
        for (let start = open; start + length <= close; start += SLOT_STEP_MINUTES * MINUTE) {
          const end = start + length;
          if (start < earliest || start > latest) continue;
          if (off.some((t) => overlaps(start, end, dayStart + timeToMinutes(t.startTime!) * MINUTE, dayStart + timeToMinutes(t.endTime!) * MINUTE))) continue;
          if (input.busy.some((b) => overlaps(start, end, b.startsAt.getTime(), b.endsAt.getTime()))) continue;
          slots.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
        }
      }
    }
    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    out.push({ date, slots });
  }
  return out;
}
