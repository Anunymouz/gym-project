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

const formatter = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 35000 → "GH₵350" (the ₵ symbol is what Ghanaians expect to see). */
export function formatGhs(amount: Pesewas): string {
  return formatter.format(amount / 100).replace(/^GH?₵|^₵/, 'GH₵');
}
