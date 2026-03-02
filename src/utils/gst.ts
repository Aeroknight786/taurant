import { GstBreakdown } from '../types';

export const GST_RATES = {
  LICENSED_BAR:    18,
  RESTAURANT_ONLY: 5,
};

/**
 * Calculate GST breakdown for a line item.
 * priceExGst and result amounts are all in paise.
 */
export function calcGstBreakdown(
  priceExGst: number,
  quantity: number,
  gstPercent: number
): { subtotal: number; gstAmount: number; totalIncGst: number; cgst: number; sgst: number } {
  const subtotal    = priceExGst * quantity;
  const gstAmount   = Math.round(subtotal * gstPercent / 100);
  const totalIncGst = subtotal + gstAmount;
  const cgst        = Math.round(gstAmount / 2);
  const sgst        = gstAmount - cgst;
  return { subtotal, gstAmount, totalIncGst, cgst, sgst };
}

/**
 * Aggregate GST across multiple line items.
 */
export function aggregateGst(
  items: Array<{ priceExGst: number; quantity: number; gstPercent: number }>
): GstBreakdown {
  let subtotalExGst = 0;
  let cgstAmount    = 0;
  let sgstAmount    = 0;

  for (const item of items) {
    const { subtotal, cgst, sgst } = calcGstBreakdown(item.priceExGst, item.quantity, item.gstPercent);
    subtotalExGst += subtotal;
    cgstAmount    += cgst;
    sgstAmount    += sgst;
  }

  return {
    subtotalExGst,
    cgstPercent:  9,
    sgstPercent:  9,
    cgstAmount,
    sgstAmount,
    totalIncGst: subtotalExGst + cgstAmount + sgstAmount,
  };
}

/** Format paise to ₹ display string */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
