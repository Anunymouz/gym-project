import { Redirect } from 'expo-router';
import { homeFor } from '@/lib/routes';
import { useSession } from '@/lib/session';

/** Entry point: send people to the right place for their session state. */
export default function Index() {
  const { status } = useSession();
  return <Redirect href={homeFor(status)} />;
}
