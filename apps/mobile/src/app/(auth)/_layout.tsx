import { Redirect, Stack } from 'expo-router';
import { homeFor } from '@/lib/routes';
import { useSession } from '@/lib/session';

export default function AuthLayout() {
  const { status } = useSession();
  if (status !== 'signedOut') return <Redirect href={homeFor(status)} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
