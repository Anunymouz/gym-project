import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Import only the weights we use (the package root would bundle all nine).
import { Outfit_400Regular } from '@expo-google-fonts/outfit/400Regular';
import { Outfit_500Medium } from '@expo-google-fonts/outfit/500Medium';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { Outfit_700Bold } from '@expo-google-fonts/outfit/700Bold';
import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit/800ExtraBold';
import { AnimatedSplash } from '@/components/brand/animated-splash';
import { NotificationTaps } from '@/components/notification-taps';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme';

// Keep the native splash (same midnight background) up until fonts and the session are ready,
// then hand over to the animated splash so the transition is seamless.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });
  const { status } = useSession();
  const [showSplash, setShowSplash] = useState(true);
  const ready = (fontsLoaded || !!fontError) && status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);


  if (!ready) return null;

  return (
    <>
      <StatusBar style={showSplash ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding/profile" />
        <Stack.Screen name="onboarding/location" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="store/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="store/product/[id]" />
        <Stack.Screen name="store/cart" />
        <Stack.Screen name="store/checkout" />
        <Stack.Screen name="store/address" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="orders/index" />
        <Stack.Screen name="orders/[id]" />
        <Stack.Screen name="gym/[slug]" />
        <Stack.Screen name="checkout/[planId]" />
        <Stack.Screen name="membership/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="memberships" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="receipts/index" />
        <Stack.Screen name="receipts/[id]" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="compose" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="stories/[key]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="trainer/[id]" />
        <Stack.Screen name="book/[trainerId]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="workout/[id]" />
        <Stack.Screen name="workout/play/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="workout-history" />
        <Stack.Screen name="profile" />
      </Stack>
      {status === 'ready' && !showSplash && <NotificationTaps />}
      {showSplash && <AnimatedSplash onFinish={() => setShowSplash(false)} />}
    </>
  );
}
