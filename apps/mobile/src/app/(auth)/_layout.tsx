import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/lib/session';

export default function AuthLayout() {
  const { status } = useSession();
  if (status === 'ready') return <Redirect href="/home" />;
  if (status === 'needsOnboarding') return <Redirect href="/onboarding/location" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
