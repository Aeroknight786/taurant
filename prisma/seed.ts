import { PrismaClient, StaffRole, GstLicenceType } from '@prisma/client';
const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding Flock database...');

  // Seed venue
  const venue = await prisma.venue.upsert({
    where:  { slug: 'the-barrel-room-koramangala' },
    update: {},
    create: {
      name:           'The Barrel Room',
      slug:           'the-barrel-room-koramangala',
      address:        '12, 80 Feet Road, Koramangala 4th Block',
      city:           'Bengaluru',
      state:          'Karnataka',
      pincode:        '560034',
      phone:          '9876543210',
      email:          'ops@barrelroom.co',
      gstin:          '29AABCU9603R1ZX',
      licenceType:    GstLicenceType.LICENSED_BAR,
      depositPercent: 75,
      isQueueOpen:    true,
      tableReadyWindowMin: 10,
    },
  });
  console.log(`✓ Venue: ${venue.name} (${venue.id})`);

  // Seed staff
  const owner = await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9000000001' } },
    update: {},
    create: { venueId: venue.id, name: 'Arjun Sharma', phone: '9000000001', role: StaffRole.OWNER },
  });
  const manager = await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9000000002' } },
    update: {},
    create: { venueId: venue.id, name: 'Priya Nair', phone: '9000000002', role: StaffRole.MANAGER },
  });
  const staff1 = await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9000000003' } },
    update: {},
    create: { venueId: venue.id, name: 'Rahul D', phone: '9000000003', role: StaffRole.STAFF },
  });
  console.log(`✓ Staff: ${owner.name}, ${manager.name}, ${staff1.name}`);

  // Seed tables
  const tableData = [
    { label: 'T1', capacity: 2, section: 'Bar' },   { label: 'T2', capacity: 2, section: 'Bar' },
    { label: 'T3', capacity: 4, section: 'Indoor' }, { label: 'T4', capacity: 4, section: 'Indoor' },
    { label: 'T5', capacity: 4, section: 'Indoor' }, { label: 'T6', capacity: 6, section: 'Indoor' },
    { label: 'R1', capacity: 4, section: 'Rooftop' },{ label: 'R2', capacity: 4, section: 'Rooftop' },
    { label: 'R3', capacity: 6, section: 'Rooftop' },{ label: 'R4', capacity: 8, section: 'Rooftop' },
  ];
  for (const t of tableData) {
    await prisma.table.upsert({
      where:  { venueId_label: { venueId: venue.id, label: t.label } },
      update: {},
      create: { venueId: venue.id, ...t },
    });
  }
  console.log(`✓ Tables: ${tableData.length} created`);

  // Seed menu
  const drinkscat = await prisma.menuCategory.upsert({
    where:  { venueId_name: { venueId: venue.id, name: 'Drinks' } },
    update: {},
    create: { venueId: venue.id, name: 'Drinks', sortOrder: 1 },
  });
  const starterscat = await prisma.menuCategory.upsert({
    where:  { venueId_name: { venueId: venue.id, name: 'Starters' } },
    update: {},
    create: { venueId: venue.id, name: 'Starters', sortOrder: 2 },
  });

  const menuItems = [
    { categoryId: drinkscat.id, name: 'Kingfisher Premium 650ml', priceExGst: 27500, gstPercent: 18, isAlcohol: true, isVeg: true },
    { categoryId: drinkscat.id, name: 'Old Monk + Cola', priceExGst: 32000, gstPercent: 18, isAlcohol: true, isVeg: true },
    { categoryId: drinkscat.id, name: 'Craft IPA (500ml)', priceExGst: 42500, gstPercent: 18, isAlcohol: true, isVeg: true },
    { categoryId: drinkscat.id, name: 'Fresh Lime Soda', priceExGst: 9000, gstPercent: 5, isAlcohol: false, isVeg: true },
    { categoryId: starterscat.id, name: 'Chicken 65', priceExGst: 28000, gstPercent: 5, isAlcohol: false, isVeg: false },
    { categoryId: starterscat.id, name: 'Paneer Tikka', priceExGst: 24000, gstPercent: 5, isAlcohol: false, isVeg: true },
    { categoryId: starterscat.id, name: 'Nachos with Salsa', priceExGst: 18000, gstPercent: 5, isAlcohol: false, isVeg: true },
  ];

  for (const item of menuItems) {
    const existing = await prisma.menuItem.findFirst({ where: { venueId: venue.id, name: item.name } });
    if (!existing) await prisma.menuItem.create({ data: { venueId: venue.id, ...item } });
  }
  console.log(`✓ Menu items: ${menuItems.length} created`);

  console.log('\n🐦 Seed complete!');
  console.log(`   Venue ID: ${venue.id}`);
  console.log(`   Venue slug: ${venue.slug}`);
  console.log(`   Staff OTP test phone: 9000000002 (manager)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
