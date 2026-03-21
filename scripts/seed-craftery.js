/**
 * seed-craftery.js
 * Plain JS seed — no ts-node required. Uses the compiled Prisma client.
 * Run with: node scripts/seed-craftery.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding The Craftery by Subko...');

  // ── Venue ──────────────────────────────────────────────────────
  const venue = await prisma.venue.upsert({
    where:  { slug: 'the-craftery-koramangala' },
    update: {
      name:                'The Craftery by Subko',
      address:             'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
      city:                'Bengaluru',
      state:               'Karnataka',
      pincode:             '560034',
      phone:               '9900000001',
      email:               'hello@subko.coffee',
      depositPercent:      30,
      isQueueOpen:         true,
      tableReadyWindowMin: 15,
    },
    create: {
      name:                'The Craftery by Subko',
      slug:                'the-craftery-koramangala',
      address:             'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
      city:                'Bengaluru',
      state:               'Karnataka',
      pincode:             '560034',
      phone:               '9900000001',
      email:               'hello@subko.coffee',
      gstin:               '29AABCS1234R1ZX',
      licenceType:         'RESTAURANT_ONLY',
      depositPercent:      30,
      isQueueOpen:         true,
      tableReadyWindowMin: 15,
    },
  });
  console.log(`✓ Venue: ${venue.name} (${venue.id})`);

  // ── Staff ──────────────────────────────────────────────────────
  await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9900000001' } },
    update: {},
    create: { venueId: venue.id, name: 'Aditya Palkar', phone: '9900000001', role: 'OWNER' },
  });
  await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9900000002' } },
    update: {},
    create: { venueId: venue.id, name: 'Meenakshi A.', phone: '9900000002', role: 'MANAGER' },
  });
  await prisma.staff.upsert({
    where:  { venueId_phone: { venueId: venue.id, phone: '9900000003' } },
    update: {},
    create: { venueId: venue.id, name: 'Ravi S.', phone: '9900000003', role: 'STAFF' },
  });
  console.log('✓ Staff: 3 created');

  // ── Tables ─────────────────────────────────────────────────────
  const tables = [
    { label: 'C1', capacity: 2, section: 'Counter' },
    { label: 'C2', capacity: 2, section: 'Counter' },
    { label: 'C3', capacity: 4, section: 'Counter' },
    { label: 'I1', capacity: 2, section: 'Indoor' },
    { label: 'I2', capacity: 2, section: 'Indoor' },
    { label: 'I3', capacity: 4, section: 'Indoor' },
    { label: 'I4', capacity: 4, section: 'Indoor' },
    { label: 'I5', capacity: 6, section: 'Indoor' },
    { label: 'P1', capacity: 4, section: 'Patio' },
    { label: 'P2', capacity: 4, section: 'Patio' },
    { label: 'P3', capacity: 6, section: 'Patio' },
    { label: 'P4', capacity: 8, section: 'Patio' },
  ];
  for (const t of tables) {
    await prisma.table.upsert({
      where:  { venueId_label: { venueId: venue.id, label: t.label } },
      update: {},
      create: { venueId: venue.id, ...t },
    });
  }
  console.log(`✓ Tables: ${tables.length} created`);

  // ── Menu categories ────────────────────────────────────────────
  const [coffees, coldBrews, toasts, sandwiches, pizzas, desserts] = await Promise.all([
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Coffees' } },               update: { sortOrder: 1 }, create: { venueId: venue.id, name: 'Coffees',               sortOrder: 1 } }),
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Cold Brews & Specials' } }, update: { sortOrder: 2 }, create: { venueId: venue.id, name: 'Cold Brews & Specials', sortOrder: 2 } }),
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Toasts & Eggs' } },         update: { sortOrder: 3 }, create: { venueId: venue.id, name: 'Toasts & Eggs',         sortOrder: 3 } }),
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Sandwiches' } },            update: { sortOrder: 4 }, create: { venueId: venue.id, name: 'Sandwiches',            sortOrder: 4 } }),
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Pizzas' } },                update: { sortOrder: 5 }, create: { venueId: venue.id, name: 'Pizzas',                sortOrder: 5 } }),
    prisma.menuCategory.upsert({ where: { venueId_name: { venueId: venue.id, name: 'Pastries & Desserts' } },   update: { sortOrder: 6 }, create: { venueId: venue.id, name: 'Pastries & Desserts',   sortOrder: 6 } }),
  ]);
  console.log('✓ Categories: 6 created');

  // ── Menu items ─────────────────────────────────────────────────
  const items = [
    // Coffees
    { categoryId: coffees.id,    name: 'Flat White',                description: '40ml espresso, 145ml milk and microfoam. Subko specialty beans.',                                           priceExGst: 28000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 1 },
    { categoryId: coffees.id,    name: 'Cappuccino',                description: 'Classic cappuccino with single origin honey from Moonshine Honey Project.',                                 priceExGst: 28000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 2 },
    { categoryId: coffees.id,    name: 'Cortado',                   description: '40ml espresso with 40ml water — more concentrated than an Americano.',                                      priceExGst: 26000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 3 },
    { categoryId: coffees.id,    name: 'Espresso',                  description: '40ml shot of Subko specialty coffee beans, single origin.',                                                  priceExGst: 22000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 4 },
    { categoryId: coffees.id,    name: 'Americano',                 description: '40ml espresso with 100ml water.',                                                                            priceExGst: 24000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 5 },
    { categoryId: coffees.id,    name: 'Condensed Milk Latte',      description: '40ml espresso, 30ml condensed milk, topped with steamed milk.',                                              priceExGst: 30000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 6 },
    // Cold Brews & Specials
    { categoryId: coldBrews.id,  name: '16 Hour Cold Brew',         description: 'Subko slow-steeped cold brew — clean, chocolatey, zero bitterness.',                                       priceExGst: 32000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 1 },
    { categoryId: coldBrews.id,  name: 'Strawberry Chilli Cold Brew', description: '16 hour cold brew muddled with a strawberry-chilli infusion, topped with tonic.',                         priceExGst: 38000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 2 },
    { categoryId: coldBrews.id,  name: 'Rum Ganache Espresso',      description: 'Subko specialty ristretto, rum ganache, pumpkin spice, and milk.',                                          priceExGst: 42000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 3 },
    { categoryId: coldBrews.id,  name: 'Gingerbread Hot Chocolate', description: 'Specialty espresso topped with gingerbread-infused milk, finished with a gingerbread man.',                 priceExGst: 38000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 4 },
    // Toasts & Eggs
    { categoryId: toasts.id,     name: 'Avocado Toast',             description: "Signature sourdough, smashed avocado, pickled beetroot and onion, fresh chimichurri, housemade podi.",     priceExGst: 52000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 1 },
    { categoryId: toasts.id,     name: 'Shakshuka',                 description: 'Tomato and pepper sauce, egg, garlic labneh, dukkah, parsley, feta. Served with sourdough.',               priceExGst: 55000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 2 },
    { categoryId: toasts.id,     name: 'Eggs on Toast',             description: 'Garlic labneh, pistachio and basil pesto, roasted cherry tomatoes, poached eggs, olive oil.',              priceExGst: 55000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 3 },
    { categoryId: toasts.id,     name: 'Butter Toast',              description: "Signature sourdough topped with butter and Maldon salt.",                                                   priceExGst: 24000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 4 },
    { categoryId: toasts.id,     name: 'Podi GF Toast',             description: 'Podi infused gluten-free toast with podi infused fresh cream cheese and mustard seeds.',                   priceExGst: 30000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 5 },
    // Sandwiches
    { categoryId: sandwiches.id, name: 'Kashmiri Chilli Chicken',   description: "Signature sourdough grilled with Kashmiri chilli harissa, cheese, and chicken.",                           priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 1 },
    { categoryId: sandwiches.id, name: 'Tamarind Chicken',          description: 'Sourdough grilled with tamarind chicken, cheese, smoky tomato and onion salsa.',                           priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 2 },
    { categoryId: sandwiches.id, name: 'Bacon Onion Jam',           description: "Signature sourdough layered and grilled with housemade bacon onion jam and rocket.",                       priceExGst: 55000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 3 },
    // Pizzas
    { categoryId: pizzas.id,     name: 'Margherita',                description: 'Marinara sauce, buffalo mozzarella cheese, fresh basil.',                                                   priceExGst: 52000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 1 },
    { categoryId: pizzas.id,     name: 'Pork Sausage & Jalapeño',   description: 'Marinara sauce, pork sausage, jalapeños, onions, mozzarella cheese.',                                      priceExGst: 62000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 2 },
    { categoryId: pizzas.id,     name: 'Goan Chorizo Hot Honey',    description: 'Marinara sauce, mozzarella, Goan chorizo, hot honey, ricotta.',                                             priceExGst: 65000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 3 },
    { categoryId: pizzas.id,     name: 'Miso Pumpkin (Vegan)',      description: 'Miso-glazed pumpkin, onions, mushrooms, spinach, green cashew cream, marinara sauce.',                     priceExGst: 60000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 4 },
    { categoryId: pizzas.id,     name: 'Stracciatella & Pesto',     description: 'Stracciatella cheese, marinara sauce, pesto, Nolen Gur tomatoes.',                                         priceExGst: 62000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 5 },
    // Pastries & Desserts
    { categoryId: desserts.id,   name: 'Butter Croissant',          description: 'Housemade laminated croissant — 72 hour cold-proofed, served warm.',                                       priceExGst: 24000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 1 },
    { categoryId: desserts.id,   name: 'Almond Croissant',          description: 'Twice-baked croissant filled with almond frangipane, topped with flaked almonds.',                         priceExGst: 28000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 2 },
    { categoryId: desserts.id,   name: 'Subko Cacao Chocolate Bar', description: 'Gluten-free wafer crunch folded into 45% Subko cacao milk chocolate.',                                     priceExGst: 35000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 3 },
    { categoryId: desserts.id,   name: 'Notella Dark Chocolate',    description: 'Housemade Notella, 70% dark chocolate, Maldon sea salt.',                                                   priceExGst: 38000, gstPercent: 5, isVeg: true,  isAlcohol: false, sortOrder: 4 },
    { categoryId: desserts.id,   name: 'Butter Chicken Pot Pie',    description: 'Flaky pot pie packed with creamy and smoky butter chicken.',                                                priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 5 },
  ];

  let created = 0;
  for (const item of items) {
    const existing = await prisma.menuItem.findFirst({ where: { venueId: venue.id, name: item.name } });
    if (!existing) {
      await prisma.menuItem.create({ data: { venueId: venue.id, ...item } });
      created++;
    }
  }
  console.log(`✓ Menu items: ${created} created, ${items.length - created} already existed`);

  console.log('\n☕ Craftery seed complete!');
  console.log(`   Venue slug: ${venue.slug}`);
  console.log(`   URL: /v/the-craftery-koramangala`);
  console.log(`   Staff OTP (manager): 9900000002`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
