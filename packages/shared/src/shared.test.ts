import { describe, expect, it } from 'vitest';
import { cedisToPesewas, formatGhs, pesewas } from './money.js';
import { emailSchema, ghanaPhoneSchema, nearbyGymsQuerySchema, otpCodeSchema } from './schemas.js';

describe('money', () => {
  it('converts cedis to integer pesewas', () => {
    expect(cedisToPesewas(350)).toBe(35000);
    expect(cedisToPesewas(12.5)).toBe(1250);
  });
  it('rejects fractional or negative pesewas', () => {
    expect(() => pesewas(1.5)).toThrow(RangeError);
    expect(() => pesewas(-1)).toThrow(RangeError);
  });
  it('formats with the cedi sign', () => {
    expect(formatGhs(pesewas(35000))).toMatch(/^GH₵\s?350$/);
  });
});

describe('schemas', () => {
  it('normalises email', () => {
    expect(emailSchema.parse('  Ama@Example.COM ')).toBe('ama@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
  it('accepts only 6-digit codes', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true);
    expect(otpCodeSchema.safeParse('12345a').success).toBe(false);
  });
  it('normalises Ghana phone numbers to E.164', () => {
    expect(ghanaPhoneSchema.parse('024 123 4567')).toBe('+233241234567');
    expect(ghanaPhoneSchema.safeParse('+1 555 123 4567').success).toBe(false);
  });
  it('validates nearby gym queries', () => {
    expect(nearbyGymsQuerySchema.safeParse({ lat: '5.63', lng: '-0.16', radiusKm: '5' }).success).toBe(true);
    expect(nearbyGymsQuerySchema.safeParse({ lat: 5.63, lng: -0.16, radiusKm: 7 }).success).toBe(false);
  });
});
