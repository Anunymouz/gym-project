import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/** Entry point: send people to the right place for their session state. */
export default function Index() {
  const { status } = useSession();
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (status === 'needsOnboarding') return <Redirect href="/onboarding/location" />;
  return <Redirect href="/home" />;
}
