import type { WorkoutStep } from '@bgym/shared';

/**
 * The guided workout as a list of phases (get ready, each set, the rests between) and a pure
 * reducer that moves through them. Times are absolute (Date.now()) so the countdown stays right
 * even if the JS thread stalls; pausing stores what was left.
 */
export type Phase =
  | { kind: 'ready'; seconds: number; step: number }
  | { kind: 'work'; step: number; set: number; sets: number; seconds: number | null }
  | { kind: 'rest'; seconds: number; step: number; nextStep: number; nextSet: number };

const READY_SECONDS = 5;

export function buildPhases(steps: Pick<WorkoutStep, 'sets' | 'reps' | 'durationSec' | 'restSec'>[]): Phase[] {
  const out: Phase[] = [{ kind: 'ready', seconds: READY_SECONDS, step: 0 }];
  steps.forEach((s, step) => {
    const sets = Math.max(1, s.sets ?? 1);
    for (let set = 1; set <= sets; set++) {
      out.push({ kind: 'work', step, set, sets, seconds: s.reps ? null : (s.durationSec ?? null) });
      const last = step === steps.length - 1 && set === sets;
      if (!last && s.restSec) out.push({ kind: 'rest', seconds: s.restSec, step, nextStep: set === sets ? step + 1 : step, nextSet: set === sets ? 1 : set + 1 });
    }
  });
  return out;
}

export interface PlayerState {
  phases: Phase[];
  i: number;
  /** When the current timed phase ends (running), or null for reps. */
  endsAt: number | null;
  /** While paused: milliseconds left in the timed phase. */
  leftMs: number | null;
  paused: boolean;
  pausedAt: number | null;
  pausedMs: number;
  startedAt: number;
  now: number;
  finishedAt: number | null;
  /** Steps whose last set was finished. */
  completed: number[];
}

export type PlayerAction =
  | { type: 'tick'; now: number }
  | { type: 'next'; now: number }
  | { type: 'back'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'addRest'; seconds: number }
  | { type: 'finish'; now: number };

const timed = (p: Phase | undefined) => (p && (p.kind !== 'work' || p.seconds) ? (p.kind === 'work' ? p.seconds! : p.seconds) : null);

export function startPlayer(phases: Phase[], now: number): PlayerState {
  return { phases, i: 0, endsAt: now + (timed(phases[0]) ?? 0) * 1000, leftMs: null, paused: false, pausedAt: null, pausedMs: 0, startedAt: now, now, finishedAt: null, completed: [] };
}

function goTo(s: PlayerState, i: number, now: number): PlayerState {
  const leaving = s.phases[s.i];
  const completed = leaving?.kind === 'work' && leaving.set === leaving.sets && i > s.i && !s.completed.includes(leaving.step) ? [...s.completed, leaving.step] : s.completed;
  if (i >= s.phases.length) return { ...s, completed, now, finishedAt: now, endsAt: null, paused: false, pausedMs: s.pausedMs + (s.pausedAt ? now - s.pausedAt : 0), pausedAt: null };
  const t = timed(s.phases[i]);
  return { ...s, i, completed, now, endsAt: t && !s.paused ? now + t * 1000 : null, leftMs: t && s.paused ? t * 1000 : null };
}

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  if (s.finishedAt) return s;
  switch (a.type) {
    case 'tick':
      if (!s.paused && s.endsAt && a.now >= s.endsAt) return goTo(s, s.i + 1, a.now);
      return { ...s, now: a.now };
    case 'next':
      return goTo(s, s.i + 1, a.now);
    case 'back': {
      // Back to the start of the previous set (skipping rests), or restart this one.
      let i = s.i - 1;
      while (i > 0 && s.phases[i]?.kind !== 'work') i--;
      return goTo({ ...s, completed: s.completed }, Math.max(0, i), a.now);
    }
    case 'pause':
      if (s.paused) return s;
      return { ...s, paused: true, pausedAt: a.now, now: a.now, leftMs: s.endsAt ? Math.max(0, s.endsAt - a.now) : null, endsAt: null };
    case 'resume':
      if (!s.paused) return s;
      return { ...s, paused: false, pausedAt: null, pausedMs: s.pausedMs + (s.pausedAt ? a.now - s.pausedAt : 0), now: a.now, endsAt: s.leftMs != null ? a.now + s.leftMs : null, leftMs: null };
    case 'addRest':
      if (s.phases[s.i]?.kind !== 'rest') return s;
      return s.paused ? { ...s, leftMs: (s.leftMs ?? 0) + a.seconds * 1000 } : { ...s, endsAt: (s.endsAt ?? s.now) + a.seconds * 1000 };
    case 'finish':
      return goTo(s, s.phases.length, a.now);
  }
}

/** Milliseconds left in the current timed phase, or null for a reps set. */
export const leftMs = (s: PlayerState) => (s.paused ? s.leftMs : s.endsAt ? Math.max(0, s.endsAt - s.now) : null);

/** Workout time so far, not counting pauses. */
export const elapsedSec = (s: PlayerState) => Math.max(0, Math.round(((s.finishedAt ?? s.now) - s.startedAt - s.pausedMs - (s.pausedAt ? s.now - s.pausedAt : 0)) / 1000));
