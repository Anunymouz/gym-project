import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTabBarSpace } from '@/components/tab-bar';
import { colors, space } from '@/theme';

/** Standard screen container: safe areas, background and padding. */
export function Screen({
  children,
  scroll,
  edges = ['top'],
  style,
  tabs,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
  /** Inside the tab navigator: leave room for the floating tab bar. */
  tabs?: boolean;
}) {
  const tabSpace = useTabBarSpace();
  const bottom = tabs ? { paddingBottom: tabSpace + space.md } : undefined;
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, bottom, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, bottom, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md },
});
