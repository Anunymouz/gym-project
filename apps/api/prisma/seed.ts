/**
 * Development seed: sample (fictional) gyms around Accra, plans, and store categories.
 * Safe to re-run: upserts by unique keys. Never run against production.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { estimateWorkoutMinutes } from '@bgym/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { starterExercises, starterWorkouts } from './seed-workouts.js';

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
/** Demo people get both parts of their name, like someone who finished the profile step. */
const named = (name: string) => {
  const [firstName, ...rest] = name.split(' ');
  return { name, firstName: firstName!, lastName: rest.join(' ') };
};
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
  await prisma.trainerInvitation.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  const ids = demoUsers.map((u) => u.id);
  // The demo store partner (its products, orders and pickup point) is rebuilt from scratch.
  const demoSellers = (await prisma.seller.findMany({ where: { contactEmail: { endsWith: DEMO_DOMAIN } }, select: { id: true } })).map((x) => x.id);
  await prisma.order.deleteMany({ where: { OR: [{ userId: { in: ids } }, { sellerId: { in: demoSellers } }] } });
  await prisma.product.deleteMany({ where: { sellerId: { in: demoSellers } } });
  await prisma.pickupLocation.deleteMany({ where: { sellerId: { in: demoSellers } } });
  await prisma.seller.deleteMany({ where: { id: { in: demoSellers } } });
  if (ids.length) {
    // Things demo accounts made while trying the app and dashboards.
    const trainerIds = (await prisma.trainer.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((t) => t.id);
    const byDemo = { OR: [{ userId: { in: ids } }, { trainerId: { in: trainerIds } }] };
    await prisma.booking.deleteMany({ where: byDemo });
    await prisma.packagePurchase.deleteMany({ where: byDemo });
    await prisma.trainer.deleteMany({ where: { id: { in: trainerIds } } });
    await prisma.post.deleteMany({ where: { authorUserId: { in: ids } } });
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: ids } } } });
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: ids } } } });
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
  const owner = await prisma.user.create({ data: { email: `owner${DEMO_DOMAIN}`, ...named('Kofi Mensah'), roles: ['member', 'gym_staff'] } });
  const frontDesk = await prisma.user.create({ data: { email: `frontdesk${DEMO_DOMAIN}`, ...named('Esi Quaye'), roles: ['member', 'gym_staff'] } });
  // BGYM team member: reviews gym applications in the admin dashboard.
  await prisma.user.create({ data: { email: `admin${DEMO_DOMAIN}`, ...named('Ama Darko'), roles: ['member', 'admin'] } });
  await prisma.gymStaff.createMany({ data: [{ gymId: gym.id, userId: owner.id, role: 'owner' }, { gymId: gym.id, userId: frontDesk.id, role: 'front_desk' }] });

  const now = Date.now();
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [name, planName, startedDaysAgo, channel] of demoMembers) {
    const plan = gym.plans.find((p) => p.name === planName)!;
    const user = await prisma.user.create({ data: { email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${DEMO_DOMAIN}`, ...named(name) } });
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
  const trainers = await seedTrainers(gym.id);
  await seedStore();
  console.log(`Demo: owner${DEMO_DOMAIN} (owner) and frontdesk${DEMO_DOMAIN} (front desk) at ${gym.name}, ${demoMembers.length} members; admin${DEMO_DOMAIN} (BGYM team); trainers ${trainers.join(', ')}; store partner partner${DEMO_DOMAIN} (Accra Nutrition Hub).`);
}

/** Two listed trainers at the demo gym, with photos, hours and packages, ready to book. */
async function seedTrainers(gymId: string): Promise<string[]> {
  const people = [
    {
      email: `trainer${DEMO_DOMAIN}`, name: 'Kwame Asante', photo: 'trainer-kwame.jpg', price: 12000, duration: 60,
      bio: 'Strength coach for 9 years. I help beginners lift with confidence and experienced lifters break plateaus, with simple plans you can follow on your own between sessions.',
      specialties: ['Strength', 'Weight loss', 'Bodybuilding'], certifications: ['NASM Certified Personal Trainer', 'First Aid & CPR'],
      packages: [{ name: '8 sessions a month', description: 'Two sessions a week with a written plan for your other days.', sessionsCount: 8, validityDays: 31, pricePesewas: 84000 }, { name: 'Kick-start: 4 sessions', description: null, sessionsCount: 4, validityDays: 21, pricePesewas: 44000 }],
      hours: [1, 2, 3, 4, 5].flatMap((weekday) => [{ weekday, startTime: '06:00', endTime: '10:00' }, { weekday, startTime: '16:00', endTime: '20:00' }]).concat([{ weekday: 6, startTime: '07:00', endTime: '12:00' }]),
    },
    {
      email: `trainer2${DEMO_DOMAIN}`, name: 'Akua Boateng', photo: 'trainer-akua.jpg', price: 9000, duration: 45,
      bio: 'Mobility, HIIT and women’s strength. Sessions are tough but friendly, and built around your schedule, your goals and how your body feels that day.',
      specialties: ['HIIT', 'Mobility', 'Pre & postnatal'], certifications: ['ACE Group Fitness Instructor'],
      packages: [{ name: '6 sessions', description: 'Use them within 6 weeks.', sessionsCount: 6, validityDays: 42, pricePesewas: 48000 }],
      hours: [2, 4, 6].map((weekday) => ({ weekday, startTime: '06:30', endTime: '11:00' })).concat([1, 3, 5].map((weekday) => ({ weekday, startTime: '17:00', endTime: '20:30' }))),
    },
  ];
  const names: string[] = [];
  for (const p of people) {
    const user = await prisma.user.create({ data: { email: p.email, ...named(p.name), roles: ['member', 'trainer'], phone: '+233240000000' } });
    const trainer = await prisma.trainer.create({
      data: {
        userId: user.id, gymId, status: 'active', listed: true, bio: p.bio, specialties: p.specialties, certifications: p.certifications,
        sessionPricePesewas: p.price, sessionDurationMin: p.duration, cancelHours: 24,
        paystackSubaccountCode: `ACCT_dev_demo_${p.photo.slice(8, 13)}`, payoutMethod: 'mobile_money', payoutBankName: 'MTN Mobile Money', payoutAccountName: p.name, payoutAccountLast4: '4321', payoutUpdatedAt: new Date(),
        availability: { createMany: { data: p.hours } },
        packages: { createMany: { data: p.packages } },
      },
    });
    const keys = await seedPhoto('trainers', trainer.id, p.photo);
    if (keys) await prisma.trainer.update({ where: { id: trainer.id }, data: { photoKey: keys.key, photoThumbKey: keys.thumbKey } });
    names.push(`${p.email} (${p.name})`);
  }
  return names;
}

type DemoProduct = { title: string; brand: string; category: string; photo: string; description: string; variants: Array<[name: string, sku: string, price: number, stock: number, was?: number]> };

/** BGYM's own demo products and a demo partner, with photos, ready to buy in the app. */
async function seedStore(): Promise<void> {
  const categories = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const platform = (await prisma.seller.findFirst({ where: { type: 'platform' } }))!;
  await prisma.$executeRaw`DELETE FROM pickup_locations p WHERE "sellerId" = ${platform.id}::uuid AND NOT EXISTS (SELECT 1 FROM orders o WHERE o."pickupLocationId" = p.id)`;
  if (!(await prisma.pickupLocation.count({ where: { sellerId: platform.id } }))) {
    await prisma.$executeRaw`INSERT INTO pickup_locations (id, "sellerId", "addressText", "contactPhone", location)
      VALUES (gen_random_uuid(), ${platform.id}::uuid, 'BGYM warehouse, Spintex Road, near Coca-Cola roundabout', '+233302000000', ST_SetSRID(ST_MakePoint(-0.1012, 5.6342), 4326)::geography)`;
  }
  const own: DemoProduct[] = [
    { title: 'BGYM Resistance Band Set', brand: 'BGYM', category: 'accessories', photo: 'product-bands.jpg', description: 'Five latex bands from light to extra heavy, with handles, ankle straps and a door anchor. Great for warm-ups, rehab and training at home.', variants: [['Set of 5', 'DEMO-BANDS-5', 18000, 40, 22000]] },
    { title: 'Rubber Hex Dumbbells (pair)', brand: 'BGYM', category: 'equipment', photo: 'product-dumbbells.jpg', description: 'Rubber-coated hex heads that don’t roll, with knurled chrome handles. Sold as a pair.', variants: [['2 × 5 kg', 'DEMO-DB-5', 35000, 12], ['2 × 10 kg', 'DEMO-DB-10', 62000, 8], ['2 × 15 kg', 'DEMO-DB-15', 89000, 2]] },
    { title: 'Olympic Bumper Plates', brand: 'BGYM', category: 'equipment', photo: 'product-plates.jpg', description: 'Solid rubber bumper plates with a steel insert for 50 mm Olympic bars. Price per plate.', variants: [['10 kg', 'DEMO-PLATE-10', 40000, 20], ['20 kg', 'DEMO-PLATE-20', 75000, 10]] },
    { title: 'BGYM Training Shoes', brand: 'BGYM', category: 'apparel', photo: 'product-shoes.jpg', description: 'Flat, stable sole for lifting and a breathable upper for conditioning work.', variants: [['EU 40', 'DEMO-SHOE-40', 65000, 4], ['EU 42', 'DEMO-SHOE-42', 65000, 6], ['EU 44', 'DEMO-SHOE-44', 65000, 3]] },
  ];
  for (const p of own) await upsertDemoProduct(platform.id, categories, p);

  const user = await prisma.user.create({ data: { email: `partner${DEMO_DOMAIN}`, ...named('Yaw Mensah'), roles: ['member', 'partner'] } });
  const partner = await prisma.seller.create({
    data: {
      type: 'partner', name: 'Accra Nutrition Hub', commissionBps: 1500, contactEmail: `partner${DEMO_DOMAIN}`, contactPhone: '+233201234567',
      paystackSubaccountCode: 'ACCT_dev_demo_partner', payoutMethod: 'mobile_money', payoutBankName: 'MTN Mobile Money', payoutAccountName: 'Accra Nutrition Hub', payoutAccountLast4: '7788', payoutUpdatedAt: new Date(),
      users: { create: { userId: user.id, role: 'owner' } },
    },
  });
  await prisma.$executeRaw`INSERT INTO pickup_locations (id, "sellerId", "addressText", "contactPhone", location)
    VALUES (gen_random_uuid(), ${partner.id}::uuid, 'Accra Nutrition Hub, Oxford Street, Osu', '+233201234567', ST_SetSRID(ST_MakePoint(-0.1820, 5.5571), 4326)::geography)`;
  await upsertDemoProduct(partner.id, categories, {
    title: 'Gold Standard 100% Whey', brand: 'Optimum Nutrition', category: 'supplements', photo: 'product-whey.jpg',
    description: '24 g of protein per scoop from whey isolate, concentrate and peptides. Mixes easily with water or milk.',
    variants: [['2 lb · Double Rich Chocolate', 'DEMO-ON-WHEY-2', 85000, 15, 95000], ['5 lb · Double Rich Chocolate', 'DEMO-ON-WHEY-5', 165000, 6], ['5 lb · Vanilla Ice Cream', 'DEMO-ON-WHEY-5V', 165000, 0]],
  });
}

/** Creates (or refreshes, by SKU) a live demo product with its photo. */
async function upsertDemoProduct(sellerId: string, categories: Map<string, string>, p: DemoProduct): Promise<void> {
  const existing = await prisma.productVariant.findUnique({ where: { sku: p.variants[0]![1] }, select: { productId: true } });
  const data = { title: p.title, brand: p.brand, description: p.description, categoryId: categories.get(p.category)!, status: 'active' as const, publishedAt: new Date(), sellerId };
  const product = existing ? await prisma.product.update({ where: { id: existing.productId }, data }) : await prisma.product.create({ data });
  for (const [i, [name, sku, price, stock, was]] of p.variants.entries()) {
    await prisma.productVariant.upsert({
      where: { sku },
      update: { name, pricePesewas: price, compareAtPricePesewas: was ?? null, stock, reserved: 0, isActive: true, sortOrder: i, productId: product.id },
      create: { productId: product.id, name, sku, pricePesewas: price, compareAtPricePesewas: was ?? null, stock, sortOrder: i },
    });
  }
  if (!(await prisma.productImage.count({ where: { productId: product.id } }))) {
    const keys = await seedPhoto('products', product.id, p.photo);
    if (keys) await prisma.productImage.create({ data: { productId: product.id, key: keys.key, thumbKey: keys.thumbKey, width: 1000, height: 1000 } });
  }
}

/** Writes a seed photo into local storage the way uploads are stored (development storage only). */
async function seedPhoto(folder: string, ownerId: string, file: string): Promise<{ key: string; thumbKey: string } | null> {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') return null;
  const here = dirname(fileURLToPath(import.meta.url));
  const input = await readFile(resolve(here, 'seed-assets', file));
  const id = randomUUID();
  const key = `${folder}/${ownerId}/${id}.webp`;
  const thumbKey = `${folder}/${ownerId}/${id}_t.webp`;
  const root = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');
  await mkdir(resolve(root, folder, ownerId), { recursive: true });
  await writeFile(resolve(root, key), await sharp(input).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
  await writeFile(resolve(root, thumbKey), await sharp(input).rotate().resize({ width: 480, height: 480, fit: 'inside' }).webp({ quality: 75 }).toBuffer());
  return { key, thumbKey };
}

/** BGYM's starter workout library. Re-running updates the text and steps; covers are added once. */
async function seedWorkouts(): Promise<void> {
  const ids = new Map<string, string>();
  for (const e of starterExercises) {
    const { slug, ...data } = e;
    const row = await prisma.exercise.upsert({ where: { externalId: `bgym:${slug}` }, update: data, create: { ...data, externalId: `bgym:${slug}`, source: 'bgym' }, select: { id: true } });
    ids.set(slug, row.id);
  }
  for (const [sortOrder, w] of starterWorkouts.entries()) {
    const steps = w.steps.map(([slug, sets, reps, durationSec, restSec], i) => {
      const exerciseId = ids.get(slug);
      if (!exerciseId) throw new Error(`Unknown exercise ${slug}`);
      return { exerciseId, sortOrder: i, sets, reps, durationSec, restSec };
    });
    const data = { title: w.title, description: w.description, level: w.level, goal: w.goal, isFree: w.isFree, isPublished: true, sortOrder, durationMin: estimateWorkoutMinutes(steps) };
    const existing = await prisma.workout.findUnique({ where: { slug: w.slug }, select: { id: true, coverKey: true } });
    const workout = existing
      ? await prisma.workout.update({ where: { id: existing.id }, data, select: { id: true, coverKey: true } })
      : await prisma.workout.create({ data: { ...data, slug: w.slug }, select: { id: true, coverKey: true } });
    await prisma.workoutExercise.deleteMany({ where: { workoutId: workout.id } });
    await prisma.workoutExercise.createMany({ data: steps.map((s) => ({ ...s, workoutId: workout.id })) });
    if (!workout.coverKey) {
      const keys = await seedPhoto('workouts', workout.id, w.photo);
      if (keys) await prisma.workout.update({ where: { id: workout.id }, data: { coverKey: keys.key, coverThumbKey: keys.thumbKey } });
    }
  }
  console.log(`Workouts: ${starterExercises.length} exercises, ${starterWorkouts.length} workouts (${starterWorkouts.filter((w) => w.isFree).length} free).`);
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
  await seedWorkouts();
  await seedDemo();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
