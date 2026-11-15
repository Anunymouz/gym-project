/**
 * Money is always stored and sent as integer pesewas (GHS × 100) to avoid
 * floating-point errors. Format only at the edge, for display.
 */
export type Pesewas = number & { readonly __brand: 'Pesewas' };

export function pesewas(amount: number): Pesewas {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Invalid pesewas amount: ${amount}`);
  }
  return amount as Pesewas;
}

export function cedisToPesewas(cedis: number): Pesewas {
  return pesewas(Math.round(cedis * 100));
}

const options = { style: 'currency', currency: 'GHS', currencyDisplay: 'narrowSymbol' } as const;
const whole = new Intl.NumberFormat('en-GH', { ...options, minimumFractionDigits: 0, maximumFractionDigits: 0 });
const withPesewas = new Intl.NumberFormat('en-GH', { ...options, minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 35000 → "GH₵350", 3960 → "GH₵39.60" (whole cedis drop the decimals; anything else shows two). */
export function formatGhs(amount: Pesewas): string {
  return (amount % 100 === 0 ? whole : withPesewas).format(amount / 100).replace(/^GH?₵|^₵/, 'GH₵');
}
