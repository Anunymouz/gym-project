import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { UnsubscribeForm } from './unsubscribe-form';

export const metadata: Metadata = { title: 'Email settings', referrer: 'no-referrer' };

export default function UnsubscribePage({ searchParams }: PageProps<'/unsubscribe'>) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-sm rounded-[24px] border border-line bg-white p-7 shadow-[0_24px_60px_rgba(13,16,40,0.08)]">
        <Image src="/brand/bgym-mark.svg" alt="" width={88} height={76} className="mx-auto" priority />
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<'/unsubscribe'>['searchParams'] }) {
  const { t } = await searchParams;
  return <UnsubscribeForm token={typeof t === 'string' ? t : ''} />;
}
