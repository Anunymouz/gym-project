import { useEffect, useState } from 'react';
import type { Cart } from '@bgym/shared';
import { storeApi } from './api';

/**
 * The cart, shared by every store screen (badge, product page, cart, checkout). The server
 * keeps the real cart; this is the latest copy, refreshed after every change.
 */
let cart: Cart | null = null;
const listeners = new Set<(c: Cart | null) => void>();
const emit = () => listeners.forEach((l) => l(cart));

export const cartStore = {
  get: () => cart,
  set(next: Cart) {
    cart = next;
    emit();
  },
  async refresh(): Promise<Cart | null> {
    try {
      cart = await storeApi.cart();
      emit();
    } catch {
      // Offline: keep what we had.
    }
    return cart;
  },
  async setLine(variantId: string, quantity: number): Promise<Cart> {
    cart = await storeApi.setLine(variantId, quantity);
    emit();
    return cart;
  },
  clear() {
    cart = null;
    emit();
  },
};

/** The current cart; loads it the first time any screen asks. */
export function useCart(): Cart | null {
  const [value, setValue] = useState(cart);
  useEffect(() => {
    listeners.add(setValue);
    if (!cart) void cartStore.refresh();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
