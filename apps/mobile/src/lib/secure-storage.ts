import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Small wrapper over SecureStore (iOS Keychain / Android Keystore).
 * Items stay on this device only (never restored from a backup onto another phone).
 * Web is a development preview only: values live in memory and vanish on reload.
 */
const memory = new Map<string, string>();
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return memory.get(key) ?? null;
    return SecureStore.getItemAsync(key, options);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return void memory.set(key, value);
    await SecureStore.setItemAsync(key, value, options);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return void memory.delete(key);
    await SecureStore.deleteItemAsync(key, options);
  },
};
