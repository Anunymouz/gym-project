import type { SessionStatus } from './session';

/** The screen each session state belongs on. Every guard uses this so the flow stays consistent. */
export function homeFor(status: SessionStatus) {
  switch (status) {
    case 'signedOut':
      return '/sign-in' as const;
    case 'needsProfile':
      return '/onboarding/profile' as const;
    case 'needsOnboarding':
      return '/onboarding/location' as const;
    default:
      return '/home' as const;
  }
}
