import type { WorkoutStep } from '@bgym/shared';

/** "30 s" or "1:30". */
export const seconds = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** "3 × 10 reps · 45 s rest" or "2 × 30 s · 20 s rest". */
export function stepSummary(s: Pick<WorkoutStep, 'sets' | 'reps' | 'durationSec' | 'restSec' | 'notes'>): string {
  const work = s.reps ? `${s.reps} reps` : s.durationSec ? seconds(s.durationSec) : '';
  const sets = s.sets && s.sets > 1 ? `${s.sets} × ${work}` : work;
  return [sets, s.restSec ? `${seconds(s.restSec)} rest` : null, s.notes].filter(Boolean).join(' · ');
}
