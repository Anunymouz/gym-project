import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-sm rounded-[24px] border border-line bg-white p-7 shadow-[0_24px_60px_rgba(13,16,40,0.08)]">
        <Image src="/brand/bgym-mark.svg" alt="" width={88} height={76} className="mx-auto" priority />
        <h1 className="mt-4 text-center text-2xl font-extrabold">Sign in to BGYM</h1>
        <p className="mt-1 text-center text-mute">For gyms, trainers, store partners and the BGYM team.</p>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<'/sign-in'>['searchParams'] }) {
  const { next } = await searchParams;
  return <SignInForm next={typeof next === 'string' ? next : '/gym'} />;
}
