/**
 * Development seed: sample (fictional) gyms around Accra, plans, and store categories.
 * Safe to re-run: upserts by unique keys. Never run against production.
 */
import 'dotenv/config';
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

async function main(): Promise<void> {
  for (const g of gyms) {
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO gyms (id, name, slug, description, phone, "addressText", "coverUrl", location, "openingHours", facilities, status, "updatedAt")
      VALUES (gen_random_uuid(), ${g.name}, ${g.slug}, ${g.description}, ${g.phone}, ${g.area}, ${g.cover},
              ST_SetSRID(ST_MakePoint(${g.lng}, ${g.lat}), 4326)::geography,
              ${JSON.stringify(openingHours)}::jsonb, ${g.facilities as unknown as string[]}, 'active', now())
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, phone = EXCLUDED.phone, location = EXCLUDED.location, "coverUrl" = EXCLUDED."coverUrl", "updatedAt" = now()
      RETURNING id`;
    if (!row) throw new Error(`Failed to upsert gym ${g.slug}`);
    await prisma.membershipPlan.deleteMany({ where: { gymId: row.id, memberships: { none: {} } } });
    await prisma.membershipPlan.createMany({
      data: g.plans.map(([name, durationDays, pricePesewas]) => ({ gymId: row.id, name, durationDays, pricePesewas, description: planDescriptions[name] ?? null })),
    });
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
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
