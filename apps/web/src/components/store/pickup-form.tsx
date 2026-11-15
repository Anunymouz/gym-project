'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Crosshair, MapPin } from '@phosphor-icons/react';
import type { SellerAccount } from '@bgym/shared';
import { savePickup } from '@/app/(dashboards)/store-actions';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

/** Where riders collect orders: an address, a map point and a phone number. */
export function PickupForm({ scope, pickup }: { scope: 'partner' | 'own'; pickup: SellerAccount['pickup'] }) {
  const [form, setForm] = useState({ addressText: pickup?.addressText ?? '', latitude: pickup ? String(pickup.latitude) : '', longitude: pickup ? String(pickup.longitude) : '', contactPhone: pickup?.contactPhone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: boolean; error?: string }>({});
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();
  const locate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setLocating(false); },
      () => { setMessage({ error: 'Couldn’t get your location. Allow location access, or paste the coordinates from Google Maps.' }); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const hasPoint = form.latitude !== '' && form.longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <form
      id="pickup"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await savePickup(scope, { addressText: form.addressText, latitude: lat, longitude: lng, contactPhone: form.contactPhone });
          setErrors(res.fieldErrors ?? {});
          setMessage(res.data ? { ok: true } : { error: res.error ?? (res.fieldErrors ? 'Check the highlighted fields.' : undefined) });
        });
      }}
      className="flex scroll-mt-6 flex-col gap-4 rounded-card border border-line bg-white p-5"
    >
      <div>
        <h2 className="text-lg font-extrabold">Pickup point</h2>
        <p className="text-sm text-mute">Where riders collect orders. Delivery fees are worked out from here to each customer.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pk-address" className="text-sm font-bold">Address and directions</label>
        <input id="pk-address" value={form.addressText} maxLength={200} onChange={(e) => setForm({ ...form, addressText: e.target.value })} aria-invalid={!!errors.addressText} placeholder="Shop 4, Spintex Road, opposite Shell" className={field} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5"><label htmlFor="pk-lat" className="text-sm font-bold">Latitude</label><input id="pk-lat" inputMode="decimal" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} aria-invalid={!!errors.latitude} placeholder="5.6342" className={field} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="pk-lng" className="text-sm font-bold">Longitude</label><input id="pk-lng" inputMode="decimal" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} aria-invalid={!!errors.longitude} placeholder="-0.1012" className={field} /></div>
        <button type="button" onClick={locate} disabled={locating} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud">{locating ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <Crosshair size={18} aria-hidden />} I’m there now</button>
      </div>
      <p className="-mt-2 text-xs text-mute">
        Tip: in Google Maps, long-press the spot and copy the two numbers.{' '}
        {hasPoint && <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold text-flare"><MapPin size={12} aria-hidden /> Check on the map</a>}
      </p>
      {(errors.latitude || errors.longitude) && <p className="text-sm font-semibold text-danger">That point isn’t in Ghana. Check the numbers.</p>}
      <div className="flex flex-col gap-1.5 sm:max-w-64">
        <label htmlFor="pk-phone" className="text-sm font-bold">Phone for riders</label>
        <input id="pk-phone" inputMode="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} aria-invalid={!!errors.contactPhone} placeholder="024 123 4567" className={field} />
        {errors.contactPhone && <p className="text-sm font-semibold text-danger">{errors.contactPhone}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">{pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} Save pickup point</button>
        {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> Saved</p>}
        {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
      </div>
    </form>
  );
}
