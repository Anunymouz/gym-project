/**
 * Web is a development preview only: there are no push notifications here, so this stands in
 * for push.ts without loading expo-notifications (which warns on web).
 */
export type PushStatus =
  | { state: 'on' }
  | { state: 'off'; canAsk: boolean }
  | { state: 'unavailable'; reason: string };

const unavailable: PushStatus = { state: 'unavailable', reason: 'Notifications work in the iOS and Android apps.' };

export const pushStatus = async (): Promise<PushStatus> => unavailable;
export const enablePush = async (_options: { ask: boolean }): Promise<PushStatus> => unavailable;
export const disablePushForSignOut = async (): Promise<void> => undefined;
export const openSystemSettings = async (): Promise<void> => undefined;
export const targetOf = (): string | null => null;
