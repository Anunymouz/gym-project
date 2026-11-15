import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ssr';
import { getMe } from '@/lib/session.server';
import { ApplyForm } from './apply-form';

export const metadata: Metadata = { title: 'List your gym' };

export default function ApplyPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/gym" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute hover:text-midnight">
          <ArrowLeft size={16} aria-hidden /> Back to the dashboard
        </Link>
        <div className="rounded-[24px] border border-line bg-white p-6 shadow-[0_24px_60px_rgba(13,16,40,0.08)] sm:p-8">
          <Image src="/brand/bgym-mark.svg" alt="" width={72} height={62} priority />
          <h1 className="mt-4 text-2xl font-extrabold">List your gym on BGYM</h1>
          <p className="mt-1 mb-6 text-mute">Start with the basics. Next you’ll add your hours, plans and payout account, then send it to us for review.</p>
          <Suspense>
            <Form />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Form() {
  const me = await getMe();
  return <ApplyForm askName={!me.name} />;
}
