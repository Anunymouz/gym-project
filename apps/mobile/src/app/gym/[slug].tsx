import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatGhs, openingStatus, pesewas, planPeriodLabel, type FeedPost, type GymDetail, type MembershipPlanSummary } from '@bgym/shared';
import { GlassButton } from '@/components/glass-button';
import { PostCard } from '@/components/feed/post-card';
import { ReportSheet } from '@/components/feed/report-sheet';
import { GymGallery } from '@/components/gym-gallery';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, MapTrifoldIcon, PhoneIcon, NewspaperIcon, ShoppingBagIcon, UsersThreeIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { feedApi, fetchGym } from '@/lib/api';
import { colors, fonts, radii, space } from '@/theme';

type Tab = 'Plans' | 'Info' | 'Feed' | 'Trainers';
const TABS: Tab[] = ['Plans', 'Info', 'Feed', 'Trainers'];
const DAYS: [string, string][] = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

export default function GymPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const [gym, setGym] = useState<GymDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Plans');
  const [planId, setPlanId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchGym(slug)
      .then((g) => {
        if (cancelled) return;
        setGym(g);
        setError(null);
        // Preselect the most popular choice: a ~monthly plan if there is one.
        setPlanId((g.plans.find((p) => p.durationDays === 30) ?? g.plans[0])?.id ?? null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Something went wrong'));
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  const status = useMemo(() => (gym ? openingStatus(gym.openingHours) : null), [gym]);
  const bestValueId = useMemo(() => bestValue(gym?.plans ?? []), [gym]);
  const plan = gym?.plans.find((p) => p.id === planId);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <GymGallery photos={gym?.photos ?? []} coverUrl={gym?.coverUrl ?? null} height={320} name={gym?.name ?? 'Gym'} />

        <Animated.View entering={FadeInUp.duration(450)} style={styles.sheet}>
          {!gym && !error && (
            <View style={{ gap: 10 }}>
              <Skeleton width="70%" height={26} />
              <Skeleton width="50%" height={15} />
              <Skeleton height={44} radius={12} style={{ marginTop: 10 }} />
              <Skeleton height={86} radius={18} />
              <Skeleton height={86} radius={18} />
            </View>
          )}
          {error && (
            <EmptyState
              icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />}
              title="Couldn't load this gym"
              body={error}
              action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Try again" variant="dark" onPress={() => { setError(null); setAttempt((n) => n + 1); }} /></View>}
            />
          )}
          {gym && status && (
            <Animated.View entering={FadeIn.duration(300)} style={{ gap: space.md }}>
              <View style={{ gap: 4 }}>
                <Text variant="title" accessibilityRole="header">{gym.name}</Text>
                <Text muted>{gym.addressText}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: status.isOpen ? colors.success : colors.danger }]} />
                  <Text variant="smallBold" style={{ color: status.isOpen ? colors.success : colors.danger }}>{status.isOpen ? 'Open' : 'Closed'}</Text>
                  <Text variant="small" muted>· {status.label}</Text>
                </View>
              </View>

              <View style={styles.segment} accessibilityRole="tablist">
                {TABS.map((t) => (
                  <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={[styles.segItem, tab === t && styles.segOn]}>
                    <Text variant="smallBold" style={{ color: tab === t ? colors.text : colors.textMuted }}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              {tab === 'Plans' && (
                <View style={{ gap: space.sm }}>
                  {gym.plans.length === 0 && <Text muted>This gym hasn&apos;t published its plans yet.</Text>}
                  {gym.plans.map((p, i) => (
                    <Animated.View key={p.id} entering={FadeInDown.delay(i * 60).duration(350)}>
                      <PlanCard plan={p} selected={p.id === planId} bestValue={p.id === bestValueId} onPress={() => setPlanId(p.id)} />
                    </Animated.View>
                  ))}
                  {gym.facilities.length > 0 && (
                    <View style={[styles.chips, { marginTop: space.sm }]}>
                      {gym.facilities.map((f) => (
                        <View key={f} style={styles.chip}><Text variant="smallBold">{f}</Text></View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {tab === 'Info' && (
                <View style={{ gap: space.lg }}>
                  {gym.description && <Text>{gym.description}</Text>}
                  <View style={styles.card}>
                    <View style={styles.cardTitle}><ClockIcon size={18} color={colors.text} /><Text variant="bodyBold">Opening hours</Text></View>
                    {DAYS.map(([key, label]) => {
                      const ranges = gym.openingHours[key] ?? [];
                      return (
                        <View key={key} style={styles.hoursRow}>
                          <Text variant="small" muted>{label}</Text>
                          <Text variant="smallBold">{ranges.length ? ranges.map((r) => `${r.open}–${r.close}`).join(', ') : 'Closed'}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Directions"
                        variant="secondary"
                        icon={<MapTrifoldIcon size={19} color={colors.text} />}
                        onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${gym.location.lat},${gym.location.lng}`)}
                      />
                    </View>
                    {gym.phone && (
                      <View style={{ flex: 1 }}>
                        <Button title="Call" variant="secondary" icon={<PhoneIcon size={19} color={colors.text} />} onPress={() => void Linking.openURL(`tel:${gym.phone}`)} />
                      </View>
                    )}
                  </View>
                </View>
              )}

              {tab === 'Feed' && <GymPosts slug={gym.slug} />}

              {tab === 'Trainers' && (
                <EmptyState
                  icon={<UsersThreeIcon size={28} color={colors.flare} weight="duotone" />}
                  title="Trainers at this gym"
                  body="Book personal training sessions here. Coming soon."
                />
              )}
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <GlassButton label="Back" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} color={colors.text} />
        </GlassButton>
        <GlassButton label="Open the BGYM Store" wide onPress={() => router.push('/store')}>
          <ShoppingBagIcon size={18} color={colors.flare} weight="fill" />
          <Text variant="smallBold">Store</Text>
        </GlassButton>
      </View>

      {plan && gym && (
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[styles.joinBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text variant="small" muted>{plan.name} · {planPeriodLabel(plan.durationDays)}</Text>
            <Text variant="heading">{formatGhs(pesewas(plan.pricePesewas))}</Text>
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title="Join now" onPress={() => router.push({ pathname: '/checkout/[planId]', params: { planId: plan.id, gym: gym.slug } })} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function PlanCard({ plan, selected, bestValue, onPress }: { plan: MembershipPlanSummary; selected: boolean; bestValue: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.plan, selected && styles.planOn]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="bodyBold">{plan.name}</Text>
          {bestValue && <View style={styles.badge}><Text style={styles.badgeText}>Best value</Text></View>}
        </View>
        <Text variant="small" muted>{plan.description ?? planPeriodLabel(plan.durationDays)}</Text>
      </View>
      <Text variant="heading">{formatGhs(pesewas(plan.pricePesewas))}</Text>
      {selected ? <CheckCircleIcon size={24} color={colors.flare} weight="fill" /> : <View style={styles.radio} />}
    </Pressable>
  );
}

/** Lowest price per day among plans longer than a day. */
function bestValue(plans: MembershipPlanSummary[]): string | null {
  const multi = plans.filter((p) => p.durationDays > 1);
  if (multi.length < 2) return null;
  return multi.reduce((a, b) => (b.pricePesewas / b.durationDays < a.pricePesewas / a.durationDays ? b : a)).id;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, padding: space.lg, gap: space.md, minHeight: 400 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#E7E9F1', borderRadius: 14, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segOn: { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1.5, borderColor: colors.border, padding: space.md },
  planOn: { borderColor: colors.flare, borderWidth: 2, backgroundColor: '#FFFBF9' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C9CDE0' },
  badge: { backgroundColor: colors.flareSoft, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.flare },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 6 },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 8 },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between' },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  joinBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md,
    shadowColor: colors.midnight, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
});

/** The gym's recent posts. Anyone can read them; liking is for members. */
function GymPosts({ slug }: { slug: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    feedApi.gymPosts(slug).then((p) => live && setPosts(p), () => live && setFailed(true));
    return () => { live = false; };
  }, [slug]);

  if (failed) return <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Couldn’t load posts" body="Check your connection and try again." />;
  if (!posts) return <View style={{ gap: space.md }}>{[0, 1].map((i) => <Skeleton key={i} height={260} radius={radii.lg} />)}</View>;
  if (posts.length === 0) return <EmptyState icon={<NewspaperIcon size={28} color={colors.flare} weight="duotone" />} title="No posts yet" body="Tips, news and photos from this gym will show up here." />;
  return (
    <View style={{ gap: space.md }}>
      {posts.map((p) => <PostCard key={p.id} post={p} now={now} showGym={false} onReport={setReporting} />)}
      <ReportSheet postId={reporting} onClose={() => setReporting(null)} />
    </View>
  );
}
