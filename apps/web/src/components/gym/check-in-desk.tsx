'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Camera, CameraSlash, CheckCircle, CircleNotch, EnvelopeSimple, WarningCircle, XCircle } from '@phosphor-icons/react';
import clsx from 'clsx';
import { checkInEmail, checkInPass, type CheckInResult } from '@/app/(dashboards)/gym-actions';

type Entry = { id: number; at: number; result: CheckInResult; via: 'pass' | 'email' };

const SCAN_INTERVAL_MS = 150;
const RESULT_HOLD_MS = 2600;
const SAME_CODE_COOLDOWN_MS = 6000;

const headline: Record<CheckInResult['result'], string> = {
  ok: 'Checked in',
  expired: 'Membership has ended',
  wrong_gym: 'Pass is for another gym',
  invalid: 'Pass not recognised',
  error: 'Could not check in',
};
const help: Record<Exclude<CheckInResult['result'], 'ok'>, string> = {
  expired: 'Ask them to renew in the BGYM app, then scan again.',
  wrong_gym: 'This member’s pass belongs to a different gym.',
  invalid: 'Ask them to reopen their pass in the app (it refreshes every 30 seconds) and scan again.',
  error: '',
};

type Detect = (source: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

/** Uses the browser's built-in QR detector where there is one, otherwise jsQR on a scaled-down frame. */
async function createDetector(): Promise<Detect> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  return async (video, canvas) => {
    // Read the centre square (under the on-screen guide) at up to 800px: passes are dense
    // codes, so keeping detail there matters more than covering the whole frame.
    const side = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.85);
    if (!side) return null;
    const out = Math.min(side, 800);
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, out, out);
    return jsQR(ctx.getImageData(0, 0, out, out).data, out, out, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

function chime(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.35));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // Sound is a nicety; ignore browsers that block it.
  }
}

export function CheckInDesk({ gymName }: { gymName: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ value: string; at: number } | null>(null);
  const nextId = useRef(1);

  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'blocked' | 'unsupported'>('off');
  const [current, setCurrent] = useState<Entry | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');

  const show = useCallback((result: CheckInResult, via: Entry['via']) => {
    const entry: Entry = { id: nextId.current++, at: Date.now(), result, via };
    setCurrent(entry);
    setHistory((h) => [entry, ...h].slice(0, 12));
    chime(result.result === 'ok');
    navigator.vibrate?.(result.result === 'ok' ? 60 : [60, 60, 60]);
  }, []);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera('off');
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return setCamera('unsupported');
    setCamera('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setCamera('on');
    } catch (err) {
      setCamera(err instanceof DOMException && err.name === 'NotAllowedError' ? 'blocked' : 'unsupported');
    }
  }, []);

  // Scan loop while the camera is on.
  useEffect(() => {
    if (camera !== 'on') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let detect: Detect | null = null;

    const tick = async () => {
      if (cancelled) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2 && !busy.current) {
        detect ??= await createDetector();
        const code = await detect(v, c).catch(() => null);
        const now = Date.now();
        const repeat = code && lastCode.current?.value === code && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS;
        if (code && !repeat && !cancelled) {
          lastCode.current = { value: code, at: now };
          busy.current = true;
          startTransition(async () => {
            show(await checkInPass(code), 'pass');
            setTimeout(() => { busy.current = false; }, RESULT_HOLD_MS);
          });
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [camera, show]);

  // Always release the camera when leaving the page.
  useEffect(() => stop, [stop]);

  const onEmail = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await checkInEmail(email);
      show(result, 'email');
      if (result.result === 'ok') setEmail('');
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <section aria-label="Scan a member pass" className="flex flex-col gap-4 rounded-card border border-line bg-white p-4 sm:p-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-midnight">
          <video ref={video} muted playsInline className={clsx('size-full object-cover', camera !== 'on' && 'hidden')} />
          <canvas ref={canvas} className="hidden" />
          {camera === 'on' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <div className="relative size-[58%] max-w-72 rounded-3xl shadow-[0_0_0_9999px_rgba(8,10,26,0.45)]">
                {['top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map((c) => (
                  <span key={c} className={clsx('absolute size-10 border-flare', c)} />
                ))}
                <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-flare/80" />
              </div>
            </div>
          )}
          {camera !== 'on' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
              <div className="flex flex-col items-center gap-3">
                {camera === 'blocked' || camera === 'unsupported' ? <CameraSlash size={40} weight="duotone" aria-hidden /> : <Camera size={40} weight="duotone" aria-hidden />}
                <p className="max-w-xs text-sm text-white/80">
                  {camera === 'blocked'
                    ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
                    : camera === 'unsupported'
                      ? 'This browser can’t use the camera here (it needs HTTPS or localhost). Use the email lookup instead.'
                      : `Point the camera at the member’s BGYM pass to check them in to ${gymName}.`}
                </p>
                {camera !== 'unsupported' && (
                  <button type="button" onClick={start} disabled={camera === 'starting'} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold disabled:opacity-70">
                    {camera === 'starting' ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <Camera size={18} weight="bold" aria-hidden />}
                    {camera === 'blocked' ? 'Try again' : 'Start camera'}
                  </button>
                )}
              </div>
            </div>
          )}
          {current && <ResultOverlay key={current.id} entry={current} onDone={() => setCurrent((c) => (c?.id === current.id ? null : c))} />}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-mute" aria-live="polite">{pending ? 'Checking…' : camera === 'on' ? 'Scanning. Hold the pass steady about 20 cm away.' : 'Camera off'}</p>
          {camera === 'on' && <button type="button" onClick={stop} className="font-bold text-mute hover:text-midnight">Stop camera</button>}
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <section aria-labelledby="email-title" className="rounded-card border border-line bg-white p-5">
          <h2 id="email-title" className="font-bold">No pass? Look them up</h2>
          <p className="mt-1 text-sm text-mute">Check in a member by the email on their BGYM account.</p>
          <form onSubmit={onEmail} className="mt-3 flex gap-2">
            <label htmlFor="checkin-email" className="sr-only">Member email</label>
            <div className="relative flex-1">
              <EnvelopeSimple size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
              <input id="checkin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@email.com" autoComplete="off"
                className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-10 text-sm outline-none focus:border-flare" />
            </div>
            <button type="submit" disabled={pending || !email} className="h-11 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60">Check in</button>
          </form>
        </section>

        <section aria-labelledby="recent-title" className="rounded-card border border-line bg-white p-5">
          <h2 id="recent-title" className="font-bold">This session</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-mute">Check-ins you make here will be listed until you leave the page.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line" aria-live="polite">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <ResultIcon result={h.result} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{'member' in h.result && h.result.member ? h.result.member.name ?? 'Member' : headline[h.result.result]}</span>
                    <span className="block text-sm text-mute">{h.result.result === 'ok' ? h.result.plan : h.via === 'email' && h.result.result === 'invalid' ? 'No membership found' : headline[h.result.result]}</span>
                  </span>
                  <time className="text-xs text-mute tabular-nums">{new Date(h.at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ResultIcon({ result, size }: { result: CheckInResult; size: number }) {
  if (result.result === 'ok') return <CheckCircle size={size} weight="fill" className="shrink-0 text-success" aria-label="Checked in" />;
  if (result.result === 'error') return <WarningCircle size={size} weight="fill" className="shrink-0 text-flare" aria-label="Error" />;
  return <XCircle size={size} weight="fill" className="shrink-0 text-danger" aria-label="Refused" />;
}

function ResultOverlay({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, RESULT_HOLD_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  const r = entry.result;
  const ok = r.result === 'ok';
  const noMember = entry.via === 'email' && r.result === 'invalid';
  return (
    <div role="status" className={clsx('absolute inset-0 grid place-items-center p-6 text-center text-white motion-safe:animate-[fade-in_160ms_ease-out]', ok ? 'bg-success/95' : r.result === 'error' ? 'bg-flare/95' : 'bg-danger/95')}>
      <div className="flex flex-col items-center gap-2">
        {ok ? <CheckCircle size={64} weight="fill" aria-hidden /> : r.result === 'error' ? <WarningCircle size={64} weight="fill" aria-hidden /> : <XCircle size={64} weight="fill" aria-hidden />}
        <p className="text-2xl font-extrabold">{ok && r.member ? r.member.name ?? 'Member' : noMember ? 'No membership found' : headline[r.result]}</p>
        <p className="max-w-xs text-white/90">
          {r.result === 'ok' ? `${r.plan ?? 'Membership'}${r.endsAt ? ` · until ${new Date(r.endsAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })}` : ''}` : r.result === 'error' ? r.message : noMember ? 'Nobody with that email has a membership here. Check the spelling, or ask them to join in the BGYM app.' : help[r.result]}
        </p>
      </div>
    </div>
  );
}
