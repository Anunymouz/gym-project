import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import type { IconProps } from 'phosphor-react-native';
import { FloatingTabBar } from '@/components/tab-bar';
import { BarbellIcon, HouseIcon, MapPinIcon, UserCircleIcon, UsersThreeIcon } from '@/components/icons';
import { homeFor } from '@/lib/routes';
import { useSession } from '@/lib/session';

const tab = (Icon: ComponentType<IconProps>) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />;
  };

export default function TabsLayout() {
  const { status } = useSession();
  if (status !== 'ready') return <Redirect href={homeFor(status)} />;

  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tab(HouseIcon) }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts', tabBarIcon: tab(BarbellIcon) }} />
      <Tabs.Screen name="gyms" options={{ title: 'Gyms', tabBarIcon: tab(MapPinIcon) }} />
      <Tabs.Screen name="trainers" options={{ title: 'Trainers', tabBarIcon: tab(UsersThreeIcon) }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: tab(UserCircleIcon) }} />
    </Tabs>
  );
}
