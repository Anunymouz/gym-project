import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { BarbellIcon, HouseIcon, MapPinIcon, UserCircleIcon, UsersThreeIcon } from '@/components/icons';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/theme';

const tab = (Icon: ComponentType<IconProps>) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />;
  };

export default function TabsLayout() {
  const { status } = useSession();
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (status === 'needsOnboarding') return <Redirect href="/onboarding/location" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.flare,
        tabBarInactiveTintColor: '#9AA0B4',
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tab(HouseIcon) }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', tabBarIcon: tab(BarbellIcon) }} />
      <Tabs.Screen name="gyms" options={{ title: 'Gyms', tabBarIcon: tab(MapPinIcon) }} />
      <Tabs.Screen name="trainers" options={{ title: 'Trainers', tabBarIcon: tab(UsersThreeIcon) }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: tab(UserCircleIcon) }} />
    </Tabs>
  );
}
