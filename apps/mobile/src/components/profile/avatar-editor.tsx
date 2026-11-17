import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { ActionSheet, type SheetAction } from '@/components/feed/action-sheet';
import { CameraIcon, ImageSquareIcon, PersonSimpleRunIcon, TrashIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { authApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/theme';

export const initialsOf = (first?: string | null, last?: string | null) => `${first?.trim()[0] ?? ''}${last?.trim()[0] ?? ''}`.toUpperCase();

/** The person's profile photo (or initials), with a camera badge: tap to choose, take or remove a photo. */
export function AvatarEditor({ size = 96, firstName, lastName, onError }: { size?: number; firstName?: string; lastName?: string; onError?: (message: string | null) => void }) {
  const { user, updateUser } = useSession();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const initials = initialsOf(firstName ?? user?.firstName, lastName ?? user?.lastName);

  const upload = async (from: 'library' | 'camera') => {
    onError?.(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85, exif: false };
    let result: ImagePicker.ImagePickerResult;
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access needed', 'Allow BGYM to use the camera in Settings to take a profile photo.');
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    const a = result.canceled ? undefined : result.assets[0];
    if (!a) return;
    setBusy(true);
    try {
      await updateUser(await authApi.setAvatar({ uri: a.uri, name: a.fileName ?? 'photo.jpg', type: a.mimeType ?? 'image/jpeg' }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Couldn’t upload that photo. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    onError?.(null);
    setBusy(true);
    try {
      await updateUser(await authApi.removeAvatar());
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Couldn’t remove the photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const actions: SheetAction[] = [
    { label: 'Choose from library', icon: <ImageSquareIcon size={20} color={colors.text} />, onPress: () => void upload('library') },
    ...(Platform.OS !== 'web' ? [{ label: 'Take a photo', icon: <CameraIcon size={20} color={colors.text} />, onPress: () => void upload('camera') }] : []),
    ...(user?.avatarUrl ? [{ label: 'Remove photo', icon: <TrashIcon size={20} color={colors.danger} />, destructive: true, onPress: () => void remove() }] : []),
  ];
  const badge = Math.round(size * 0.34);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={user?.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
        disabled={busy}
        onPress={() => setMenu(true)}
        style={({ pressed }) => [{ width: size, height: size }, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
          ) : initials ? (
            <Animated.Text key={initials} entering={ZoomIn.springify().damping(14)} style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Animated.Text>
          ) : (
            <PersonSimpleRunIcon size={size * 0.42} color={colors.violet} weight="duotone" />
          )}
          {busy && (
            <View style={[StyleSheet.absoluteFill, styles.busy]}>
              <ActivityIndicator color={colors.white} />
            </View>
          )}
        </View>
        <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2 }]}>
          <CameraIcon size={badge * 0.55} color={colors.white} weight="fill" />
        </View>
      </Pressable>
      <ActionSheet visible={menu} title="Profile photo" actions={actions} onClose={() => setMenu(false)} />
    </>
  );
}

/** Small read-only avatar for lists (the Me card). */
export function UserAvatar({ size = 52 }: { size?: number }) {
  const { user } = useSession();
  const initials = initialsOf(user?.firstName, user?.lastName) || user?.email.charAt(0).toUpperCase();
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {user?.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.extrabold, color: colors.violet },
  busy: { backgroundColor: 'rgba(8,10,26,0.45)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.flare, borderWidth: 3, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
