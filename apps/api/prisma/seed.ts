/**
 * Development seed: sample (fictional) gyms around Accra, plans, and store categories.
 * Safe to re-run: upserts by unique keys. Never run against production.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed a production database.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const weekdayHours = { open: '05:00', close: '22:00' };
const openingHours = {
  mon: [weekdayHours], tue: [weekdayHours], wed: [weekdayHours], thu: [weekdayHours], fri: [weekdayHours],
  sat: [{ open: '06:00', close: '20:00' }], sun: [{ open: '07:00', close: '14:00' }],
};

// Fictional sample gyms at real Accra neighbourhood coordinates.
// Cover photos: Unsplash (Unsplash License). Real gyms upload their own photos.
const gyms = [
  { slug: 'iron-haven-east-legon', description: 'Serious strength training in East Legon: two floors of free weights, racks and cardio, with coaches on the floor at peak hours.', phone: '+233302000101', cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=75&fm=jpg&fit=crop', name: 'Iron Haven Fitness', area: 'East Legon, Accra', lat: 5.6357, lng: -0.1573, facilities: ['AC', 'Showers', 'Parking', 'Sauna'], plans: [['Day pass', 1, 4000], ['Monthly', 30, 35000], ['Quarterly', 90, 95000]] },
  { slug: 'pulse-studio-airport', description: 'A bright boutique studio for HIIT, spin and strength classes, five minutes from the Airport Residential area.', phone: '+233302000102', cover: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=1200&q=75&fm=jpg&fit=crop', name: 'Pulse Studio', area: 'Airport Residential, Accra', lat: 5.6052, lng: -0.1718, facilities: ['AC', 'Showers', 'Classes'], plans: [['Day pass', 1, 5000], ['Monthly', 30, 30000]] },
  { slug: 'legon-strength-club', description: 'Old-school iron near campus. Platforms, plates and a community that trains hard and shows up early.', phone: '+233302000103', cover: 'https://images.unsplash.com/photo-1637666062717-1c6bcfa4a4df?w=1200&q=75&fm=jpg&fit=crop', name: 'Legon Strength Club', area: 'Legon, Accra', lat: 5.6502, lng: -0.1869, facilities: ['Free weights', 'Parking'], plans: [['Monthly', 30, 25000], ['Quarterly', 90, 68000]] },
  { slug: 'osu-body-lab', description: 'Modern training space in the heart of Osu, with women-only hours every morning and air-conditioned studios.', phone: '+233302000104', cover: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=75&fm=jpg&fit=crop', name: 'Body Lab Osu', area: 'Osu, Accra', lat: 5.5571, lng: -0.1820, facilities: ['AC', 'Showers', 'Women-only hours'], plans: [['Day pass', 1, 3500], ['Monthly', 30, 28000]] },
  { slug: 'fithub-tema', description: 'Tema\'s community gym: affordable memberships, wide cardio deck and plenty of parking.', phone: '+233302000105', cover: 'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=1200&q=75&fm=jpg&fit=crop', name: 'FitHub Tema', area: 'Community 5, Tema', lat: 5.6698, lng: -0.0166, facilities: ['AC', 'Parking'], plans: [['Monthly', 30, 22000]] },
] as const;

const planDescriptions: Record<string, string> = {
  'Day pass': 'One visit, any time the gym is open.',
  Monthly: 'Unlimited access for 30 days.',
  Quarterly: 'Unlimited access for 90 days. Best value.',
};


// ───────────── Demo gym activity (fictional people, reserved .test domain) ─────────────
const DEMO_DOMAIN = '@bgym-demo.test';
const DAY = 24 * 60 * 60 * 1000;
const demoMembers: Array<[name: string, plan: 'Day pass' | 'Monthly' | 'Quarterly', startedDaysAgo: number, channel: 'mobile_money' | 'card']> = [
  ['Ama Owusu', 'Monthly', 28, 'mobile_money'],
  ['Kojo Darko', 'Quarterly', 86, 'mobile_money'],
  ['Abena Ofori', 'Monthly', 25, 'mobile_money'],
  ['Selorm Agbeko', 'Monthly', 24, 'card'],
  ['Nana Yeboah', 'Monthly', 1, 'mobile_money'],
  ['Kwesi Appiah', 'Quarterly', 3, 'card'],
  ['Efua Mensah', 'Monthly', 12, 'mobile_money'],
  ['Yaw Boateng', 'Quarterly', 40, 'mobile_money'],
  ['Akosua Asante', 'Monthly', 8, 'mobile_money'],
  ['Kwame Nkrumah-Addo', 'Monthly', 18, 'card'],
  ['Adwoa Sarpong', 'Monthly', 45, 'mobile_money'],
  ['Fiifi Quansah', 'Quarterly', 120, 'mobile_money'],
  ['Esi Arthur', 'Monthly', 5, 'mobile_money'],
  ['Kobby Tetteh', 'Monthly', 15, 'card'],
];

async function seedDemo(): Promise<void> {
  await prisma.gymInvitation.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  const ids = demoUsers.map((u) => u.id);
  if (ids.length) {
    await prisma.checkIn.deleteMany({ where: { OR: [{ userId: { in: ids } }, { scannedById: { in: ids } }] } });
    const ms = await prisma.membership.findMany({ where: { userId: { in: ids } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    const paymentIds = ms.map((m) => m.paymentId).filter((x): x is string => !!x);
    await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
    // Gyms that demo accounts listed while trying the dashboard (never the sample gyms).
    const triedGyms = await prisma.gym.findMany({
      where: { slug: { notIn: gyms.map((g) => g.slug) }, staff: { some: { userId: { in: ids }, role: 'owner' } } },
      select: { id: true },
    });
    await prisma.gym.deleteMany({ where: { id: { in: triedGyms.map((g) => g.id) }, memberships: { none: {} } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  // Development tidy-up: non-sample gyms left with no staff and no members (e.g. from earlier demo runs).
  await prisma.gym.deleteMany({ where: { slug: { notIn: gyms.map((g) => g.slug) }, staff: { none: {} }, memberships: { none: {} } } });

  const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' }, include: { plans: true } });
  const owner = await prisma.user.create({ data: { email: `owner${DEMO_DOMAIN}`, name: 'Kofi Mensah', roles: ['member', 'gym_staff'] } });
  const frontDesk = await prisma.user.create({ data: { email: `frontdesk${DEMO_DOMAIN}`, name: 'Esi Quaye', roles: ['member', 'gym_staff'] } });
  // BGYM team member: reviews gym applications in the admin dashboard.
  await prisma.user.create({ data: { email: `admin${DEMO_DOMAIN}`, name: 'Ama Darko', roles: ['member', 'admin'] } });
  await prisma.gymStaff.createMany({ data: [{ gymId: gym.id, userId: owner.id, role: 'owner' }, { gymId: gym.id, userId: frontDesk.id, role: 'front_desk' }] });

  const now = Date.now();
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [name, planName, startedDaysAgo, channel] of demoMembers) {
    const plan = gym.plans.find((p) => p.name === planName)!;
    const user = await prisma.user.create({ data: { email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${DEMO_DOMAIN}`, name } });
    const startsAt = new Date(now - startedDaysAgo * DAY);
    const payment = await prisma.payment.create({
      data: {
        userId: user.id, type: 'membership', provider: 'dev', reference: `bgym_${randomUUID().replace(/-/g, '')}`,
        amountPesewas: plan.pricePesewas, status: 'success', channel, paidAt: startsAt, metadata: { demo: true },
      },
    });
    const endsAt = new Date(startsAt.getTime() + plan.durationDays * DAY);
    const membership = await prisma.membership.create({
      data: { userId: user.id, gymId: gym.id, planId: plan.id, paymentId: payment.id, status: endsAt.getTime() > now ? 'active' : 'expired', startsAt, endsAt, createdAt: startsAt },
    });
    if (endsAt.getTime() > now) {
      for (let d = 0; d < 7; d++) {
        if (rand() < 0.55) {
          const at = new Date(now - d * DAY - Math.floor(rand() * 10) * 60 * 60 * 1000);
          if (at > startsAt) await prisma.checkIn.create({ data: { gymId: gym.id, membershipId: membership.id, userId: user.id, scannedById: frontDesk.id, result: 'ok', createdAt: at } });
        }
      }
    }
  }
  console.log(`Demo: owner${DEMO_DOMAIN} (owner) and frontdesk${DEMO_DOMAIN} (front desk) at ${gym.name}, ${demoMembers.length} members; admin${DEMO_DOMAIN} (BGYM team).`);
}

async function main(): Promise<void> {
  // Re-running the seed resets the sample gyms to these values (they are fictional demo data).
  for (const g of gyms) {
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO gyms (id, name, slug, description, phone, "addressText", "coverUrl", location, "openingHours", facilities, status, "updatedAt")
      VALUES (gen_random_uuid(), ${g.name}, ${g.slug}, ${g.description}, ${g.phone}, ${g.area}, ${g.cover},
              ST_SetSRID(ST_MakePoint(${g.lng}, ${g.lat}), 4326)::geography,
              ${JSON.stringify(openingHours)}::jsonb, ${g.facilities as unknown as string[]}, 'active', now())
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, phone = EXCLUDED.phone, email = NULL,
        "addressText" = EXCLUDED."addressText", location = EXCLUDED.location, "coverUrl" = EXCLUDED."coverUrl",
        "openingHours" = EXCLUDED."openingHours", facilities = EXCLUDED.facilities, status = 'active', "updatedAt" = now()
      RETURNING id`;
    if (!row) throw new Error(`Failed to upsert gym ${g.slug}`);
    // Upsert plans by name: plans that members bought must never be duplicated or deleted.
    for (const [name, durationDays, pricePesewas] of g.plans) {
      const existing = await prisma.membershipPlan.findMany({ where: { gymId: row.id, name }, orderBy: { createdAt: 'asc' } });
      const [keep, ...extras] = existing;
      const data = { durationDays, pricePesewas, description: planDescriptions[name] ?? null, isActive: true };
      if (keep) await prisma.membershipPlan.update({ where: { id: keep.id }, data });
      else await prisma.membershipPlan.create({ data: { gymId: row.id, name, ...data } });
      for (const extra of extras) {
        const used = await prisma.membership.count({ where: { planId: extra.id } });
        if (used) await prisma.membershipPlan.update({ where: { id: extra.id }, data: { isActive: false } });
        else await prisma.membershipPlan.delete({ where: { id: extra.id } });
      }
    }
  }

  for (const [name, slug] of [['Supplements', 'supplements'], ['Apparel', 'apparel'], ['Equipment', 'equipment'], ['Accessories', 'accessories']] as const) {
    await prisma.category.upsert({ where: { slug }, update: { name }, create: { name, slug } });
  }

  const platform = await prisma.seller.findFirst({ where: { type: 'platform' } });
  if (!platform) await prisma.seller.create({ data: { type: 'platform', name: 'BGYM Store' } });

  await prisma.platformSetting.upsert({
    where: { key: 'fees.default' },
    update: {},
    create: { key: 'fees.default', value: { membershipBps: null, trainerBps: null, storeCommissionBps: null, note: 'To be decided' } },
  });

  console.log(`Seeded ${gyms.length} gyms, 4 categories, platform seller and settings.`);
  await seedDemo();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
