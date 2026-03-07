import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a Flock transaction reference.
 * Format: FLK-<timestamp-base36>-<4-char-hex>
 * Example: FLK-LK4X2A1B-3F9C
 */
export function generateTxnRef(): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `FLK-${ts}-${rnd}`;
}

/**
 * Generate sequential invoice number.
 * Format: FLOCK/YYYY-YY/XXXXX
 */
export function generateInvoiceNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; April = 3
  const fyStart = month < 3 ? year - 1 : year;
  const fy = `${fyStart}-${(fyStart + 1).toString().slice(2)}`;
  const seq = sequence.toString().padStart(5, '0');
  return `FLOCK/${fy}/${seq}`;
}
