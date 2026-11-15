import { useCallback, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { membershipsApi } from './api';

export type PaymentStart = { reference: string; amountPesewas: number; provider: 'paystack' | 'dev'; authorizationUrl: string | null };
type Outcome = 'paid' | 'cancelled' | 'unconfirmed';

/**
 * Takes a payment the server has started: opens Paystack's page (live), or the development
 * approval sheet, then waits for the server to confirm it (from Paystack's webhook).
 */
export function usePayment() {
  const [devPayment, setDevPayment] = useState<PaymentStart | null>(null);
  const [confirming, setConfirming] = useState(false);
  const devAnswer = useRef<((approved: boolean) => void) | null>(null);

  const waitForConfirmation = useCallback(async (reference: string): Promise<boolean> => {
    setConfirming(true);
    try {
      for (let i = 0; i < 30; i++) {
        const s = await membershipsApi.paymentStatus(reference).catch(() => null);
        if (s?.status === 'success') return true;
        if (s?.status === 'failed') return false;
        await new Promise((r) => setTimeout(r, 2000));
      }
      return false;
    } finally {
      setConfirming(false);
    }
  }, []);

  const pay = useCallback(
    async (start: PaymentStart): Promise<Outcome> => {
      if (start.provider === 'dev') {
        const approved = await new Promise<boolean>((resolve) => {
          devAnswer.current = resolve;
          setDevPayment(start);
        });
        setDevPayment(null);
        if (!approved) return 'cancelled';
        await membershipsApi.simulatePayment(start.reference);
      } else {
        await WebBrowser.openAuthSessionAsync(start.authorizationUrl!, 'bgym://payments/complete');
      }
      return (await waitForConfirmation(start.reference)) ? 'paid' : 'unconfirmed';
    },
    [waitForConfirmation],
  );

  return {
    pay,
    confirming,
    devSheet: {
      checkout: devPayment,
      onApprove: () => devAnswer.current?.(true),
      onCancel: () => devAnswer.current?.(false),
    },
  };
}
