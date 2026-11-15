import { dueStage, withinSendHours } from './reminders.service.js';

const DAY = 86_400_000;
const now = new Date('2030-03-10T10:00:00Z');
const membership = (lengthDays: number, endsInDays: number) => {
  const endsAt = new Date(now.getTime() + endsInDays * DAY);
  return { startsAt: new Date(endsAt.getTime() - lengthDays * DAY), endsAt };
};

describe('dueStage', () => {
  it('picks the most urgent stage only', () => {
    expect(dueStage(membership(30, 6), now)).toBe('days_7');
    expect(dueStage(membership(30, 2.5), now)).toBe('days_3');
    expect(dueStage(membership(30, 0.5), now)).toBe('days_1');
    expect(dueStage(membership(30, -0.4), now)).toBe('expired');
    expect(dueStage(membership(30, 10), now)).toBeNull();
  });

  it('stops after the grace period once a membership has ended', () => {
    expect(dueStage(membership(30, -2), now)).toBeNull();
  });

  it('skips early reminders that would be noise on short plans', () => {
    expect(dueStage(membership(1, 0.5), now)).toBeNull(); // day pass
    expect(dueStage(membership(7, 6), now)).toBeNull(); // weekly: no 7-day reminder at purchase
    expect(dueStage(membership(7, 0.5), now)).toBe('days_1');
    expect(dueStage(membership(14, 2), now)).toBe('days_3');
    expect(dueStage(membership(14, 6), now)).toBeNull();
  });
});

describe('withinSendHours', () => {
  it('only sends during the day in Accra', () => {
    expect(withinSendHours(new Date('2030-03-10T06:59:00Z'))).toBe(false);
    expect(withinSendHours(new Date('2030-03-10T07:00:00Z'))).toBe(true);
    expect(withinSendHours(new Date('2030-03-10T20:59:00Z'))).toBe(true);
    expect(withinSendHours(new Date('2030-03-10T21:00:00Z'))).toBe(false);
  });
});
