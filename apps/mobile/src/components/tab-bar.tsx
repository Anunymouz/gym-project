import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, fonts } from '@/theme';

export const TAB_BAR_HEIGHT = 66;
const SIDE = 18;

/** Vertical space screens should leave free so content can scroll clear of the floating bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 16;
}

const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Floating glass tab bar: a rounded pill that hovers above the content.
 * iOS 26+: Apple's native Liquid Glass. Older iOS, Android and web: a frosted blur.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const slot = width > 0 ? (width - 12) / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(6 + state.index * slot, { damping: 18, stiffness: 190, mass: 0.8 });
  }, [state.index, slot, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: slot }));

  const content = (
    <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} role="tablist">
      {slot > 0 && <Animated.View style={[styles.indicator, indicator]} />}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const focused = index === state.index;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const color = focused ? colors.flare : '#7C8296';
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            void Haptics.selectionAsync();
            navigateToTab(route.key);
          }
        };
        return (
          <Pressable
            key={route.key}
            role="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${label}, tab, ${index + 1} of ${count}`}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
          >
            {options.tabBarIcon?.({ focused, color, size: 24 })}
            <Animated.Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      {liquidGlass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.pill}>
          {content}
        </GlassView>
      ) : (
        <View style={[styles.pill, styles.shadow]}>
          <BlurView
            intensity={Platform.OS === 'android' ? 40 : 80}
            tint="systemChromeMaterialLight"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.frost]} />
          {content}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: SIDE, right: SIDE },
  pill: { height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden' },
  shadow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: colors.midnight,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  frost: { backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.55)' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  indicator: { position: 'absolute', top: 6, bottom: 6, left: 0, borderRadius: (TAB_BAR_HEIGHT - 12) / 2, backgroundColor: 'rgba(255,90,31,0.12)' },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 11 },
});
