import { PrismaClient } from '@prisma/client';
import { seedVenueFixture, venueFixtures } from './venue-fixtures';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding Flock database...');

  const fixtureOrder = [venueFixtures.barrelRoom, venueFixtures.craftery];
  for (const fixture of fixtureOrder) {
    const result = await seedVenueFixture(prisma, fixture);
    console.log(`✓ Venue: ${result.venue.name} (${result.venue.id})`);
    console.log(`  Staff: ${result.staffCount} · Tables: ${result.tableCount} · Categories: ${result.categoryCount} · Menu items: ${result.menuItemCount}`);
  }

  console.log('\n🐦 Seed complete!');
  console.log('  Barrel Room manager OTP phone: 9000000002');
  console.log('  Craftery manager OTP phone: 9900000002');
}

main().catch(console.error).finally(() => prisma.$disconnect());
