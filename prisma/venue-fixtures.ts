import { GstLicenceType, Prisma, PrismaClient, StaffRole, VenueContentSlot } from '@prisma/client';

type VenueFixture = {
  venue: {
    name: string;
    slug: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstin?: string;
    licenceType: GstLicenceType;
    depositPercent: number;
    isQueueOpen: boolean;
    tableReadyWindowMin: number;
    maxQueueSize?: number;
    brandConfig: Prisma.InputJsonValue;
    featureConfig: Prisma.InputJsonValue;
    uiConfig: Prisma.InputJsonValue;
    opsConfig: Prisma.InputJsonValue;
  };
  contentBlocks?: Array<{
    slot: VenueContentSlot;
    title: string;
    body?: string;
    imageUrl?: string | null;
    isEnabled: boolean;
    sortOrder: number;
  }>;
  staff: Array<{
    name: string;
    phone: string;
    role: StaffRole;
  }>;
  tables: Array<{
    label: string;
    capacity: number;
    section?: string;
  }>;
  categories: Array<{
    name: string;
    sortOrder: number;
    items: Array<{
      name: string;
      description?: string;
      priceExGst: number;
      gstPercent: number;
      isVeg: boolean;
      isAlcohol: boolean;
      sortOrder?: number;
    }>;
  }>;
};

export const venueFixtures: Record<'barrelRoom' | 'craftery', VenueFixture> = {
  barrelRoom: {
    venue: {
      name: 'The Barrel Room',
      slug: 'the-barrel-room-koramangala',
      address: '12, 80 Feet Road, Koramangala 4th Block',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      phone: '9876543210',
      email: 'ops@barrelroom.co',
      gstin: '29AABCU9603R1ZX',
      licenceType: GstLicenceType.LICENSED_BAR,
      depositPercent: 75,
      isQueueOpen: true,
      tableReadyWindowMin: 10,
      maxQueueSize: 200,
      brandConfig: {
        displayName: 'The Barrel Room',
        shortName: 'Barrel Room',
        tagline: 'Queue · Pre-order · Pay',
        themeKey: 'default',
      },
      featureConfig: {
        guestQueue: true,
        preOrder: true,
        partyShare: true,
        seatedOrdering: true,
        finalPayment: true,
        staffConsole: true,
        adminConsole: true,
        flowLog: true,
        historyTab: true,
        refunds: true,
        offlineSettle: true,
        bulkClear: true,
      },
      uiConfig: {
        landingMode: 'venue',
        defaultGuestTray: 'menu',
        showContinueEntry: true,
        showQueuePosition: true,
        supportCopy: 'Join the queue, pre-order before seating, and settle the balance once the table is live.',
      },
      opsConfig: {
        queueDispatchMode: 'AUTO_TABLE',
        tableSourceMode: 'MANUAL',
        joinConfirmationMode: 'WHATSAPP',
        readyNotificationChannels: ['WHATSAPP'],
        readyReminderEnabled: false,
        readyReminderOffsetMin: 1,
        expiryNotificationEnabled: false,
        guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
        contentMode: 'DEFAULT',
      },
    },
    staff: [
      { name: 'Arjun Sharma', phone: '9000000001', role: StaffRole.OWNER },
      { name: 'Priya Nair', phone: '9000000002', role: StaffRole.MANAGER },
      { name: 'Rahul D', phone: '9000000003', role: StaffRole.STAFF },
    ],
    tables: [
      { label: 'T1', capacity: 2, section: 'Bar' },
      { label: 'T2', capacity: 2, section: 'Bar' },
      { label: 'T3', capacity: 4, section: 'Indoor' },
      { label: 'T4', capacity: 4, section: 'Indoor' },
      { label: 'T5', capacity: 4, section: 'Indoor' },
      { label: 'T6', capacity: 6, section: 'Indoor' },
      { label: 'R1', capacity: 4, section: 'Rooftop' },
      { label: 'R2', capacity: 4, section: 'Rooftop' },
      { label: 'R3', capacity: 6, section: 'Rooftop' },
      { label: 'R4', capacity: 8, section: 'Rooftop' },
    ],
    categories: [
      {
        name: 'Drinks',
        sortOrder: 1,
        items: [
          { name: 'Kingfisher Premium 650ml', priceExGst: 27500, gstPercent: 18, isAlcohol: true, isVeg: true, sortOrder: 1 },
          { name: 'Old Monk + Cola', priceExGst: 32000, gstPercent: 18, isAlcohol: true, isVeg: true, sortOrder: 2 },
          { name: 'Craft IPA (500ml)', priceExGst: 42500, gstPercent: 18, isAlcohol: true, isVeg: true, sortOrder: 3 },
          { name: 'Fresh Lime Soda', priceExGst: 9000, gstPercent: 5, isAlcohol: false, isVeg: true, sortOrder: 4 },
        ],
      },
      {
        name: 'Starters',
        sortOrder: 2,
        items: [
          { name: 'Chicken 65', priceExGst: 28000, gstPercent: 5, isAlcohol: false, isVeg: false, sortOrder: 1 },
          { name: 'Paneer Tikka', priceExGst: 24000, gstPercent: 5, isAlcohol: false, isVeg: true, sortOrder: 2 },
          { name: 'Nachos with Salsa', priceExGst: 18000, gstPercent: 5, isAlcohol: false, isVeg: true, sortOrder: 3 },
        ],
      },
    ],
  },
  craftery: {
    venue: {
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      address: 'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      phone: '9900000001',
      email: 'hello@subko.coffee',
      gstin: '29AABCS1234R1ZX',
      licenceType: GstLicenceType.RESTAURANT_ONLY,
      depositPercent: 30,
      isQueueOpen: true,
      tableReadyWindowMin: 15,
      maxQueueSize: 200,
      brandConfig: {
        displayName: 'The Craftery by Subko',
        shortName: 'Craftery',
        tagline: 'Waitlist · live updates · host desk',
        themeKey: 'craftery',
      },
      featureConfig: {
        guestQueue: true,
        preOrder: false,
        partyShare: false,
        seatedOrdering: false,
        finalPayment: false,
        staffConsole: true,
        adminConsole: true,
        flowLog: false,
        historyTab: true,
        refunds: false,
        offlineSettle: false,
        bulkClear: false,
      },
      uiConfig: {
        landingMode: 'venue',
        defaultGuestTray: 'ordered',
        showContinueEntry: true,
        showQueuePosition: false,
        supportCopy: 'Join the waitlist, keep your phone nearby, and wait for the host call when your turn comes up.',
      },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
        readyReminderEnabled: true,
        readyReminderOffsetMin: 1,
        expiryNotificationEnabled: false,
        guestWaitFormula: 'SUBKO_FIXED_V1',
        contentMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
      },
    },
    staff: [
      { name: 'Aditya Palkar', phone: '9900000001', role: StaffRole.OWNER },
      { name: 'Meenakshi A.', phone: '9900000002', role: StaffRole.MANAGER },
      { name: 'Ravi S.', phone: '9900000003', role: StaffRole.STAFF },
    ],
    tables: [
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
    ],
    categories: [
      {
        name: 'Coffees',
        sortOrder: 1,
        items: [
          { name: 'Flat White', description: '40ml espresso topped with 145ml milk and microfoam. Subko specialty beans.', priceExGst: 28000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 1 },
          { name: 'Cappuccino', description: 'Classic cappuccino with single origin honey from Moonshine Honey Project.', priceExGst: 28000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 2 },
          { name: 'Cortado', description: '40ml espresso with 40ml water — way stronger than an Americano.', priceExGst: 26000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 3 },
          { name: 'Espresso', description: '40ml shot of Subko specialty coffee beans, single origin.', priceExGst: 22000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 4 },
          { name: 'Americano', description: '40ml espresso with 100ml water — stronger than a standard Americano.', priceExGst: 24000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 5 },
          { name: 'Condensed Milk Latte', description: '40ml espresso, 30ml condensed milk, topped with steamed milk.', priceExGst: 30000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 6 },
        ],
      },
      {
        name: 'Cold Brews & Specials',
        sortOrder: 2,
        items: [
          { name: '16 Hour Cold Brew', description: 'Subko slow-steeped cold brew — clean, chocolatey, zero bitterness.', priceExGst: 32000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 1 },
          { name: 'Strawberry Chilli Cold Brew', description: 'Subko 16 hour cold brew muddled with a strawberry-chilli infusion, topped with tonic.', priceExGst: 38000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 2 },
          { name: 'Rum Ganache Espresso', description: 'Subko specialty ristretto, rum ganache, pumpkin spice, and milk.', priceExGst: 42000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 3 },
          { name: 'Gingerbread Hot Chocolate', description: 'Subko specialty espresso topped with gingerbread-infused milk, finished with a gingerbread man.', priceExGst: 38000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 4 },
        ],
      },
      {
        name: 'Toasts & Eggs',
        sortOrder: 3,
        items: [
          { name: 'Avocado Toast', description: 'Subko signature sourdough, smashed avocado, pickled beetroot and onion, fresh chimichurri, housemade podi.', priceExGst: 52000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 1 },
          { name: 'Shakshuka', description: 'Tomato and pepper sauce, egg, garlic labneh, dukkah, parsley, feta. Served with sourdough.', priceExGst: 55000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 2 },
          { name: 'Eggs on Toast', description: 'Garlic labneh, pistachio and basil pesto, roasted cherry tomatoes, poached eggs, olive oil.', priceExGst: 55000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 3 },
          { name: 'Butter Toast', description: 'Subko signature sourdough topped with butter and Maldon salt.', priceExGst: 24000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 4 },
          { name: 'Podi GF Toast', description: 'Podi infused gluten-free toast topped with podi infused fresh cream cheese, mustard seeds.', priceExGst: 30000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 5 },
        ],
      },
      {
        name: 'Sandwiches',
        sortOrder: 4,
        items: [
          { name: 'Kashmiri Chilli Chicken', description: 'Subko signature sourdough grilled with Kashmiri chilli harissa, cheese, and chicken.', priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 1 },
          { name: 'Tamarind Chicken', description: 'Sourdough sandwich grilled with tamarind chicken, cheese, smoky tomato and onion salsa.', priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 2 },
          { name: 'Bacon Onion Jam', description: 'Subko signature sourdough layered and grilled with housemade bacon onion jam and rocket.', priceExGst: 55000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 3 },
        ],
      },
      {
        name: 'Pizzas',
        sortOrder: 5,
        items: [
          { name: 'Margherita', description: 'Marinara sauce, buffalo mozzarella cheese, fresh basil.', priceExGst: 52000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 1 },
          { name: 'Pork Sausage & Jalapeño', description: 'Marinara sauce, pork sausage, jalapeños, onions, mozzarella cheese.', priceExGst: 62000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 2 },
          { name: 'Goan Chorizo Hot Honey', description: 'Marinara sauce, mozzarella cheese, Goan chorizo, hot honey, ricotta.', priceExGst: 65000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 3 },
          { name: 'Miso Pumpkin (Vegan)', description: 'Miso-glazed pumpkin, onions, mushrooms, spinach, green cashew cream, marinara sauce.', priceExGst: 60000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 4 },
          { name: 'Stracciatella & Pesto', description: 'Stracciatella cheese, marinara sauce, pesto, Nolen Gur tomatoes.', priceExGst: 62000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 5 },
        ],
      },
      {
        name: 'Pastries & Desserts',
        sortOrder: 6,
        items: [
          { name: 'Butter Croissant', description: 'Housemade laminated croissant — 72 hour cold-proofed, served warm.', priceExGst: 24000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 1 },
          { name: 'Almond Croissant', description: 'Twice-baked croissant filled with almond frangipane, topped with flaked almonds.', priceExGst: 28000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 2 },
          { name: 'Subko Cacao Chocolate Bar', description: 'Gluten-free wafer crunch folded into 45% Subko cacao milk chocolate.', priceExGst: 35000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 3 },
          { name: 'Notella Dark Chocolate', description: 'Housemade Notella, 70% dark chocolate, Maldon sea salt.', priceExGst: 38000, gstPercent: 5, isVeg: true, isAlcohol: false, sortOrder: 4 },
          { name: 'Butter Chicken Pot Pie', description: 'Flaky pot pie packed with creamy and smoky butter chicken.', priceExGst: 52000, gstPercent: 5, isVeg: false, isAlcohol: false, sortOrder: 5 },
        ],
      },
    ],
    contentBlocks: [
      {
        slot: VenueContentSlot.MENU,
        title: 'Current highlights',
        body: 'A quick look at the categories and dishes currently showing at Craftery.',
        imageUrl: null,
        isEnabled: true,
        sortOrder: 1,
      },
      {
        slot: VenueContentSlot.MERCH,
        title: 'Craftery',
        body: 'Current venue touchpoints from Craftery in Bengaluru.',
        imageUrl: null,
        isEnabled: true,
        sortOrder: 2,
      },
      {
        slot: VenueContentSlot.STORIES,
        title: 'Waitlist · live updates · host desk',
        body: 'The venue profile stays anchored to the house copy and the address on file.',
        imageUrl: null,
        isEnabled: false,
        sortOrder: 3,
      },
      {
        slot: VenueContentSlot.EVENTS,
        title: 'Today',
        body: 'Queue updates are live. The host return window is 15 minutes and staff will nudge you when your turn comes up.',
        imageUrl: null,
        isEnabled: false,
        sortOrder: 4,
      },
    ],
  },
};

export async function seedVenueFixture(prisma: PrismaClient, fixture: VenueFixture) {
  const venue = await prisma.venue.upsert({
    where: { slug: fixture.venue.slug },
    update: {
      ...fixture.venue,
    },
    create: {
      ...fixture.venue,
    },
  });

  for (const staffMember of fixture.staff) {
    await prisma.staff.upsert({
      where: { venueId_phone: { venueId: venue.id, phone: staffMember.phone } },
      update: {
        name: staffMember.name,
        role: staffMember.role,
        isActive: true,
      },
      create: {
        venueId: venue.id,
        ...staffMember,
      },
    });
  }

  for (const table of fixture.tables) {
    await prisma.table.upsert({
      where: { venueId_label: { venueId: venue.id, label: table.label } },
      update: {
        capacity: table.capacity,
        section: table.section,
      },
      create: {
        venueId: venue.id,
        ...table,
      },
    });
  }

  for (const categoryFixture of fixture.categories) {
    const category = await prisma.menuCategory.upsert({
      where: { venueId_name: { venueId: venue.id, name: categoryFixture.name } },
      update: {
        sortOrder: categoryFixture.sortOrder,
        isVisible: true,
      },
      create: {
        venueId: venue.id,
        name: categoryFixture.name,
        sortOrder: categoryFixture.sortOrder,
        isVisible: true,
      },
    });

    for (const itemFixture of categoryFixture.items) {
      const existingItem = await prisma.menuItem.findFirst({
        where: { venueId: venue.id, name: itemFixture.name },
        select: { id: true },
      });

      if (existingItem) {
        await prisma.menuItem.update({
          where: { id: existingItem.id },
          data: {
            categoryId: category.id,
            description: itemFixture.description,
            priceExGst: itemFixture.priceExGst,
            gstPercent: itemFixture.gstPercent,
            isVeg: itemFixture.isVeg,
            isAlcohol: itemFixture.isAlcohol,
            isAvailable: true,
            sortOrder: itemFixture.sortOrder ?? 0,
          },
        });
      } else {
        await prisma.menuItem.create({
          data: {
            venueId: venue.id,
            categoryId: category.id,
            description: itemFixture.description,
            name: itemFixture.name,
            priceExGst: itemFixture.priceExGst,
            gstPercent: itemFixture.gstPercent,
            isVeg: itemFixture.isVeg,
            isAlcohol: itemFixture.isAlcohol,
            isAvailable: true,
            sortOrder: itemFixture.sortOrder ?? 0,
          },
        });
      }
    }
  }

  for (const blockFixture of fixture.contentBlocks || []) {
    await prisma.venueContentBlock.upsert({
      where: { venueId_slot: { venueId: venue.id, slot: blockFixture.slot } },
      update: {
        title: blockFixture.title,
        body: blockFixture.body ?? null,
        imageUrl: blockFixture.imageUrl ?? null,
        isEnabled: blockFixture.isEnabled,
        sortOrder: blockFixture.sortOrder,
      },
      create: {
        id: `${venue.slug}-${blockFixture.slot.toLowerCase()}`,
        venueId: venue.id,
        slot: blockFixture.slot,
        title: blockFixture.title,
        body: blockFixture.body ?? null,
        imageUrl: blockFixture.imageUrl ?? null,
        isEnabled: blockFixture.isEnabled,
        sortOrder: blockFixture.sortOrder,
      },
    });
  }

  return {
    venue,
    staffCount: fixture.staff.length,
    tableCount: fixture.tables.length,
    categoryCount: fixture.categories.length,
    menuItemCount: fixture.categories.reduce((sum, category) => sum + category.items.length, 0),
    contentBlockCount: (fixture.contentBlocks || []).length,
  };
}
