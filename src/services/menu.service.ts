import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export async function getVenueMenu(venueId: string, includeUnavailable = false) {
  return prisma.menuCategory.findMany({
    where: { venueId, isVisible: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: includeUnavailable ? undefined : { isAvailable: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

export async function createMenuItem(venueId: string, data: {
  categoryId: string;
  name: string;
  description?: string;
  priceExGst: number;
  gstPercent?: number;
  isVeg?: boolean;
  isAlcohol?: boolean;
  imageUrl?: string;
  sortOrder?: number;
}) {
  return prisma.menuItem.create({
    data: {
      venueId,
      categoryId: data.categoryId,
      name: data.name,
      description: data.description,
      priceExGst: data.priceExGst,
      gstPercent: data.gstPercent ?? 5,
      isVeg: data.isVeg ?? true,
      isAlcohol: data.isAlcohol ?? false,
      imageUrl: data.imageUrl,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateMenuItem(
  id: string,
  venueId: string,
  data: Partial<{
    categoryId: string;
    name: string;
    description: string;
    priceExGst: number;
    gstPercent: number;
    isVeg: boolean;
    isAlcohol: boolean;
    isAvailable: boolean;
    imageUrl: string;
    sortOrder: number;
  }>
) {
  const item = await prisma.menuItem.findFirst({ where: { id, venueId } });
  if (!item) throw new AppError('Menu item not found', 404);
  return prisma.menuItem.update({ where: { id }, data });
}

export async function toggleItemAvailability(id: string, venueId: string) {
  const item = await prisma.menuItem.findFirst({ where: { id, venueId } });
  if (!item) throw new AppError('Menu item not found', 404);
  return prisma.menuItem.update({ where: { id }, data: { isAvailable: !item.isAvailable } });
}

export async function deleteMenuItem(id: string, venueId: string) {
  const item = await prisma.menuItem.findFirst({ where: { id, venueId } });
  if (!item) throw new AppError('Menu item not found', 404);
  await prisma.menuItem.delete({ where: { id } });
  return { deleted: true };
}
