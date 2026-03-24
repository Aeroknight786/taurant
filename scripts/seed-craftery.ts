import { PrismaClient } from '@prisma/client';
import { seedVenueFixture, venueFixtures } from '../prisma/venue-fixtures';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding The Craftery by Subko...');
  const result = await seedVenueFixture(prisma, venueFixtures.craftery);

  console.log(`✓ Venue: ${result.venue.name} (${result.venue.id})`);
  console.log(`✓ Staff: ${result.staffCount}`);
  console.log(`✓ Tables: ${result.tableCount}`);
  console.log(`✓ Categories: ${result.categoryCount}`);
  console.log(`✓ Menu items: ${result.menuItemCount}`);
  console.log('\n☕ Craftery seed complete!');
  console.log(`   Venue ID:   ${result.venue.id}`);
  console.log(`   Venue slug: ${result.venue.slug}`);
  console.log('   Staff OTP (manager): 9900000002');
  console.log('   Staff OTP (owner):   9900000001');
}

main().catch(console.error).finally(() => prisma.$disconnect());
