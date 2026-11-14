import { describe, expect, it } from 'vitest';
import { openingStatus } from './gyms.js';
import { cedisToPesewas, formatGhs, pesewas } from './money.js';
import { emailSchema, ghanaPhoneSchema, nearbyGymsQuerySchema, otpCodeSchema, updateProfileSchema } from './schemas.js';

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
  it('validates the profile step', () => {
    expect(updateProfileSchema.parse({ name: '  Ama Owusu ', goal: 'build_strength', phone: '024 123 4567' })).toEqual({
      name: 'Ama Owusu',
      goal: 'build_strength',
      phone: '+233241234567',
    });
    expect(updateProfileSchema.parse({ name: "Kwame O'Neil-Mensah", phone: '' }).phone).toBeNull();
    expect(updateProfileSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: '<script>' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: 'Ama', goal: 'fly' }).success).toBe(false);
  });
});

describe('openingStatus', () => {
  const hours = { mon: [{ open: '05:00', close: '22:00' }], sun: [] };
  it('reports open and closing time', () => {
    expect(openingStatus(hours, new Date('2026-11-16T10:30:00Z'))).toEqual({ isOpen: true, label: 'Open until 10pm' });
  });
  it('reports the next opening time and closed days', () => {
    expect(openingStatus(hours, new Date('2026-11-16T04:00:00Z'))).toEqual({ isOpen: false, label: 'Opens at 5am' });
    expect(openingStatus(hours, new Date('2026-11-15T10:00:00Z'))).toEqual({ isOpen: false, label: 'Closed now' });
  });
});
