import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import type { ExerciseMedia, WorkoutDetail, WorkoutStats } from '@bgym/shared';
import { ArrowLeftIcon, CaretDownIcon, CheckIcon, FlameIcon, PauseIcon, PersonSimpleRunIcon, PlayIcon, SkipForwardIcon, WifiSlashIcon, XIcon } from '@/components/icons';
import { OrbitLoader } from '@/components/motion/orbit-loader';
import { SuccessCheck } from '@/components/motion/success-check';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { seconds } from '@/components/workouts/step-summary';
import { workoutsApi } from '@/lib/api';
import { buildPhases, elapsedSec, leftMs, playerReducer, startPlayer, type PlayerState } from '@/lib/workout-player';
import { colors, fonts, radii, space } from '@/theme';

const EFFORT = ['Easy', 'Steady', 'Hard', 'Very hard', 'All out'] as const;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Follow a workout step by step: demo, sets and reps or a timer, rests, then a summary. */
export default function Player() {
  // Keep the screen on while following along (no warning where the browser won't allow it).
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void workoutsApi.detail(id).then(
      (d) => (d.locked ? setError('Join any gym on BGYM to unlock this workout.') : setW(d)),
      (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load this workout.'),
    );
  }, [id]);

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60, padding: space.lg }]}>
        <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Can’t start this workout" body={error} action={<Button title="Back" variant="dark" onPress={() => router.back()} />} />
      </View>
    );
  }
  if (!w) {
    return (
      <View style={[styles.screen, styles.center]}>
        <OrbitLoader />
      </View>
    );
  }
  return <Session workout={w} />;
}

const begin = (w: WorkoutDetail) => startPlayer(buildPhases(w.steps), Date.now());

function Session({ workout: w }: { workout: WorkoutDetail }) {
  const insets = useSafeAreaInsets();
  const [state, dispatch] = useReducer(playerReducer, w, begin);
  const [quitting, setQuitting] = useState(false);
  const [howTo, setHowTo] = useState(false);

  // The clock: a few ticks a second while the workout runs.
  const running = !state.paused && !state.finishedAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 200);
    return () => clearInterval(t);
  }, [running]);

  // A buzz on each new phase, and a tick for each of the last three seconds.
  const finished = !!state.finishedAt;
  useEffect(() => {
    void Haptics.notificationAsync(finished ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  }, [state.i, finished]);
  const secLeft = leftMs(state);
  const shownSec = secLeft != null ? Math.ceil(secLeft / 1000) : null;
  useEffect(() => {
    if (shownSec != null && shownSec > 0 && shownSec <= 3) void Haptics.selectionAsync();
  }, [shownSec]);

  if (state.finishedAt) return <Finished workout={w} state={state} />;

  const phase = state.phases[state.i]!;
  const step = w.steps[phase.kind === 'rest' ? phase.nextStep : phase.step]!;
  const stepNo = (phase.kind === 'rest' ? phase.nextStep : phase.step) + 1;
  const total = phase.seconds;
  const fraction = total && secLeft != null ? secLeft / (total * 1000) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      {/* Top: close, progress through the exercises, workout clock */}
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="End workout" hitSlop={8} onPress={() => { dispatch({ type: 'pause', now: Date.now() }); setQuitting(true); }} style={styles.round}>
          <XIcon size={20} color={colors.white} weight="bold" />
        </Pressable>
        <View style={styles.progress} accessible accessibilityLabel={`Exercise ${stepNo} of ${w.steps.length}`}>
          {w.steps.map((_, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: state.completed.includes(i) ? colors.flare : i === stepNo - 1 ? 'rgba(255,90,31,0.45)' : 'rgba(255,255,255,0.16)' }]} />
          ))}
        </View>
        <Text style={styles.clock} accessibilityLabel={`${elapsedSec(state)} seconds so far`}>{clock(elapsedSec(state))}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <Animated.View key={`m-${step.exercise.id}`} entering={FadeIn.duration(300)}>
          <Demo media={step.exercise.media} name={step.exercise.name} dimmed={phase.kind === 'rest'} />
        </Animated.View>

        <Animated.View key={`p-${state.i}`} entering={FadeInUp.duration(320)} style={{ gap: space.sm, alignItems: 'center' }}>
          {phase.kind === 'ready' && <Text variant="label" style={{ color: colors.ember }}>Get ready</Text>}
          {phase.kind === 'rest' && <Text variant="label" style={{ color: colors.ember }}>Rest · next up</Text>}
          {phase.kind === 'work' && <Text variant="label" style={{ color: colors.ember }}>Exercise {stepNo} of {w.steps.length}{phase.sets > 1 ? ` · Set ${phase.set} of ${phase.sets}` : ''}</Text>}
          <Text variant="title" style={{ color: colors.white, textAlign: 'center' }}>{step.exercise.name}</Text>
          {phase.kind === 'rest' && <Text style={{ color: colors.onDarkMuted }}>{phase.nextSet > 1 ? `Set ${phase.nextSet} of ${step.sets ?? 1}` : step.sets && step.sets > 1 ? `${step.sets} sets` : '1 set'}{step.reps ? ` of ${step.reps} reps` : step.durationSec ? ` of ${seconds(step.durationSec)}` : ''}</Text>}

          {phase.kind === 'work' && !phase.seconds ? (
            <View style={styles.reps} accessible accessibilityLabel={`${step.reps} reps`}>
              <Text style={styles.repsValue}>{step.reps}</Text>
              <Text style={styles.repsLabel}>reps</Text>
            </View>
          ) : (
            <Ring fraction={fraction ?? 0} label={shownSec != null ? clock(shownSec) : ''} tone={phase.kind === 'rest' ? colors.violet : colors.flare} paused={state.paused} />
          )}
          {phase.kind === 'rest' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Add 15 seconds of rest" onPress={() => dispatch({ type: 'addRest', seconds: 15 })} style={styles.more}>
              <Text variant="smallBold" style={{ color: colors.white }}>+15 s rest</Text>
            </Pressable>
          )}
          {step.notes && <Text style={{ color: colors.onDarkMuted }}>{step.notes}</Text>}
        </Animated.View>

        {step.exercise.instructions && step.exercise.instructions.length > 0 && (
          <View style={styles.howTo}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: howTo }} onPress={() => setHowTo((v) => !v)} style={styles.howToHead}>
              <Text variant="bodyBold" style={{ color: colors.white, flex: 1 }}>How to do it</Text>
              <View style={{ transform: [{ rotate: howTo ? '180deg' : '0deg' }] }}><CaretDownIcon size={18} color={colors.white} weight="bold" /></View>
            </Pressable>
            {howTo && (
              <Animated.View entering={FadeInDown.duration(220)} style={{ gap: space.sm }}>
                {step.exercise.instructions.map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text style={styles.howToNo}>{i + 1}</Text>
                    <Text style={{ color: colors.onDarkMuted, flex: 1 }}>{line}</Text>
                  </View>
                ))}
                {step.exercise.tips?.map((tip, i) => (
                  <Text key={`t${i}`} variant="small" style={{ color: colors.ember }}>Tip: {tip}</Text>
                ))}
              </Animated.View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous set" disabled={state.i === 0} onPress={() => dispatch({ type: 'back', now: Date.now() })} style={[styles.side, state.i === 0 && { opacity: 0.35 }]}>
          <ArrowLeftIcon size={22} color={colors.white} weight="bold" />
        </Pressable>
        {phase.kind === 'work' && !phase.seconds ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Set done" onPress={() => dispatch({ type: 'next', now: Date.now() })} style={({ pressed }) => [styles.main, pressed && { transform: [{ scale: 0.96 }] }]}>
            <CheckIcon size={24} color={colors.white} weight="bold" />
            <Text style={styles.mainText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={state.paused ? 'Resume' : 'Pause'} onPress={() => dispatch({ type: state.paused ? 'resume' : 'pause', now: Date.now() })} style={({ pressed }) => [styles.main, pressed && { transform: [{ scale: 0.96 }] }]}>
            {state.paused ? <PlayIcon size={24} color={colors.white} weight="fill" /> : <PauseIcon size={24} color={colors.white} weight="fill" />}
            <Text style={styles.mainText}>{state.paused ? 'Resume' : 'Pause'}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={phase.kind === 'rest' ? 'Skip rest' : 'Skip'} onPress={() => dispatch({ type: 'next', now: Date.now() })} style={styles.side}>
          <SkipForwardIcon size={22} color={colors.white} weight="fill" />
        </Pressable>
      </View>

      {quitting && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
          <Animated.View entering={FadeInUp.duration(240)} style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Text variant="heading">End this workout?</Text>
            <Text muted>{state.completed.length > 0 ? `You’ve finished ${state.completed.length} of ${w.steps.length} exercises. Save it to keep your streak going.` : 'Nothing’s finished yet, so there’s nothing to save.'}</Text>
            {state.completed.length > 0 && <Button title="Save what I did" onPress={() => { setQuitting(false); dispatch({ type: 'finish', now: Date.now() }); }} />}
            <Button title="Keep going" variant="dark" onPress={() => { setQuitting(false); dispatch({ type: 'resume', now: Date.now() }); }} />
            <Button title={state.completed.length > 0 ? 'Quit without saving' : 'Quit'} variant="secondary" onPress={() => router.back()} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

/** The exercise demo: our own video (looped, muted), a photo, an imported animation, or a placeholder. */
function Demo({ media, name, dimmed }: { media: ExerciseMedia | null | undefined; name: string; dimmed: boolean }) {
  return (
    <View style={[styles.demo, !media && styles.noDemo, dimmed && { opacity: 0.55 }]}>
      {media?.type === 'video' ? (
        <DemoVideo url={media.url} />
      ) : media ? (
        <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} accessibilityLabel={`${name} demo`} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <PersonSimpleRunIcon size={44} color="rgba(255,255,255,0.35)" weight="duotone" />
        </View>
      )}
    </View>
  );
}

function DemoVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/** A countdown ring. */
function Ring({ fraction, label, tone, paused }: { fraction: number; label: string; tone: string; paused: boolean }) {
  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityRole="timer" accessibilityLabel={`${label} left${paused ? ', paused' : ''}`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={styles.ringText}>{label}</Text>
      {paused && <Text variant="smallBold" style={{ color: colors.onDarkMuted }}>Paused</Text>}
    </View>
  );
}

/** Well done: time, exercises, how hard it felt, then save to history. */
function Finished({ workout, state }: { workout: WorkoutDetail; state: PlayerState }) {
  const insets = useSafeAreaInsets();
  const [effort, setEffort] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<WorkoutStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const duration = elapsedSec(state);
  const done = state.completed.length;
  const sent = useRef(false);

  const save = () => {
    if (sent.current) return;
    sent.current = true;
    setSaving(true);
    setError(null);
    workoutsApi
      .complete(workout.id, { durationSec: duration, exercisesCompleted: done, ...(effort && { effort }) })
      .then(
        (s) => {
          setSaved(s);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        (e: unknown) => {
          sent.current = false;
          setError(e instanceof Error ? e.message : 'Couldn’t save. Check your connection and try again.');
        },
      )
      .finally(() => setSaving(false));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.xxl, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg, gap: space.lg }]}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <SuccessCheck size={72} />
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="display" style={{ color: colors.white, textAlign: 'center' }}>{done === workout.steps.length ? 'Workout done!' : 'Good effort!'}</Text>
          <Text style={{ color: colors.onDarkMuted, textAlign: 'center' }}>{workout.title}</Text>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInUp.delay(320).duration(400)} style={styles.summary}>
        <Summary value={clock(duration)} label="time" />
        <Summary value={`${done}/${workout.steps.length}`} label="exercises" />
        {saved && <Summary value={String(saved.streakDays)} label="day streak" icon />}
      </Animated.View>

      {!saved ? (
        <Animated.View entering={FadeInUp.delay(420).duration(400)} style={{ gap: space.md }}>
          <Text variant="bodyBold" style={{ color: colors.white }}>How hard was it?</Text>
          <View style={styles.effort}>
            {EFFORT.map((label, i) => (
              <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: effort === i + 1 }} accessibilityLabel={label} onPress={() => { void Haptics.selectionAsync(); setEffort(i + 1); }} style={[styles.effortItem, effort === i + 1 && styles.effortOn]}>
                <Text style={[styles.effortNo, effort === i + 1 && { color: colors.white }]}>{i + 1}</Text>
                <Text numberOfLines={1} style={[styles.effortLabel, effort === i + 1 && { color: colors.white }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {error && <Text variant="small" style={{ color: '#FF8A8A' }}>{error}</Text>}
          <Button title="Save workout" loading={saving} onPress={save} />
          <Button title="Don’t save" variant="secondary" onPress={() => router.back()} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.duration(400)} style={{ gap: space.md }}>
          <Text style={{ color: colors.onDarkMuted, textAlign: 'center' }}>{saved.thisWeek === 1 ? 'Your first workout this week. Nice start.' : `That’s ${saved.thisWeek} workouts this week.`}</Text>
          <Button title="Done" onPress={() => router.back()} />
        </Animated.View>
      )}
    </View>
  );
}

function Summary({ value, label, icon }: { value: string; label: string; icon?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <FlameIcon size={20} color={colors.flare} weight="fill" />}
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      <Text variant="small" style={{ color: colors.onDarkMuted }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.midnight },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  clock: { fontFamily: fonts.bold, fontSize: 15, color: colors.white, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  demo: { aspectRatio: 4 / 3, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: '#1A1D3A' },
  noDemo: { aspectRatio: undefined, height: 120 },
  reps: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: space.md },
  repsValue: { fontFamily: fonts.extrabold, fontSize: 84, lineHeight: 96, color: colors.white, fontVariant: ['tabular-nums'] },
  repsLabel: { fontFamily: fonts.bold, fontSize: 22, color: colors.onDarkMuted },
  ringText: { fontFamily: fonts.extrabold, fontSize: 44, lineHeight: 52, color: colors.white, fontVariant: ['tabular-nums'] },
  howTo: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radii.lg, padding: space.lg, gap: space.md },
  howToHead: { flexDirection: 'row', alignItems: 'center' },
  howToNo: { fontFamily: fonts.extrabold, color: colors.flare, width: 16 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingTop: space.lg, backgroundColor: colors.midnight, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 64, paddingHorizontal: 32, borderRadius: 32, backgroundColor: colors.flare },
  more: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
  mainText: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.white },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,26,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: space.lg, gap: space.md },
  summary: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radii.lg, paddingVertical: space.lg },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.white, fontVariant: ['tabular-nums'] },
  effort: { flexDirection: 'row', gap: 6 },
  effortItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.sm, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.07)' },
  effortOn: { backgroundColor: colors.flare },
  effortNo: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.white },
  effortLabel: { fontFamily: fonts.semibold, fontSize: 10, color: colors.onDarkMuted },
});
