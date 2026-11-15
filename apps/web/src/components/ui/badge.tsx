import clsx from 'clsx';
import type { ReactNode } from 'react';

const tones = {
  success: 'bg-success-50 text-success',
  warning: 'bg-flare-50 text-flare',
  info: 'bg-violet-50 text-violet',
  danger: 'bg-danger-50 text-danger',
  neutral: 'bg-cloud text-mute',
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  );
}
