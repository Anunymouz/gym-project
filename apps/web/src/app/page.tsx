import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Barbell, ShieldCheck, Storefront, UsersThree } from '@phosphor-icons/react/ssr';

const portals = [
  { href: '/gym', title: 'Gyms', text: 'Members, check-ins, plans and payouts.', Icon: UsersThree },
  { href: '/trainer', title: 'Trainers', text: 'Your schedule, bookings and earnings.', Icon: Barbell },
  { href: '/partner', title: 'Store partners', text: 'Orders, products and stock.', Icon: Storefront },
  { href: '/admin', title: 'BGYM team', text: 'Approvals, payments and reports.', Icon: ShieldCheck },
] as const;

export default function Home() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(900px_500px_at_20%_-10%,#231B5E_0%,transparent_60%)] bg-midnight px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex items-center justify-between">
          <Image src="/brand/bgym-lockup-on-dark.svg" alt="BGYM" width={132} height={36} priority />
          <Link href="/sign-in" className="rounded-control bg-flare px-4 py-2.5 text-sm font-bold hover:bg-[#f04e14]">
            Sign in
          </Link>
        </header>
        <section className="max-w-2xl">
          <p className="text-sm font-bold tracking-[0.2em] text-ember uppercase">BGYM for business</p>
          <h1 className="mt-3 text-4xl leading-tight font-extrabold text-balance sm:text-5xl">Run your gym, coaching or store on BGYM.</h1>
          <p className="mt-4 text-lg text-[#B8BCD6]">One place for the businesses that power BGYM members across Accra.</p>
        </section>
        <section aria-label="Dashboards" className="grid gap-4 sm:grid-cols-2">
          {portals.map(({ href, title, text, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-card border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-flare/60 hover:bg-white/[0.07]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-flare/15 text-flare">
                <Icon size={26} weight="duotone" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{title}</span>
                <span className="block text-[#B8BCD6]">{text}</span>
              </span>
              <ArrowRight size={20} className="text-[#8A90B0] transition-transform group-hover:translate-x-1 group-hover:text-white" aria-hidden />
            </Link>
          ))}
        </section>
        <p className="text-sm text-[#8A90B0]">Preview build: dashboards open without sign-in until authentication is added.</p>
      </div>
    </main>
  );
}
