import { freeSlots } from './slots.js';

const now = new Date('2026-11-16T06:00:00Z'); // a Monday, 6am in Accra
const base = { rules: [{ weekday: 1, startTime: '06:00', endTime: '10:00' }, { weekday: 2, startTime: '17:00', endTime: '19:00' }], timeOff: [], busy: [], durationMin: 60, now };
const times = (days: ReturnType<typeof freeSlots>, i = 0) => days[i]!.slots.map((s) => s.startsAt.slice(11, 16));

describe('freeSlots', () => {
  it('lists half-hourly starts inside the trainer’s hours, with 2 hours’ notice', () => {
    const days = freeSlots({ ...base, from: '2026-11-16', days: 2 });
    expect(times(days, 0)).toEqual(['08:00', '08:30', '09:00']); // 06:00–07:30 are too soon
    expect(times(days, 1)).toEqual(['17:00', '17:30', '18:00']);
  });

  it('skips other bookings, part-day time off and whole days off', () => {
    const busy = [{ startsAt: new Date('2026-11-17T17:30:00Z'), endsAt: new Date('2026-11-17T18:30:00Z') }];
    expect(times(freeSlots({ ...base, busy, from: '2026-11-17', days: 1 }))).toEqual([]);
    const partOff = [{ date: new Date('2026-11-23T00:00:00Z'), startTime: '06:00', endTime: '07:00' }];
    expect(times(freeSlots({ ...base, timeOff: partOff, from: '2026-11-23', days: 1 }))).toEqual(['07:00', '07:30', '08:00', '08:30', '09:00']);
    const dayOff = [{ date: new Date('2026-11-23T00:00:00Z'), startTime: null, endTime: null }];
    expect(times(freeSlots({ ...base, timeOff: dayOff, from: '2026-11-23', days: 1 }))).toEqual([]);
  });

  it('stops 30 days ahead and fits the session length', () => {
    expect(times(freeSlots({ ...base, durationMin: 90, from: '2026-11-17', days: 1 }))).toEqual(['17:00', '17:30']);
    expect(times(freeSlots({ ...base, from: '2026-12-21', days: 1 }))).toEqual([]);
  });
});
