import { OrderType } from '@prisma/client';

function formatDatePart(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatSequencePart(sequence: number): string {
  return String(sequence).padStart(4, '0');
}

export function buildFlowRef(sequence: number, createdAt = new Date()): string {
  return `FLW-${formatDatePart(createdAt)}-${formatSequencePart(sequence)}`;
}

export function buildOrderRef(sequence: number, createdAt = new Date(), _type?: OrderType): string {
  return `ORD-${formatDatePart(createdAt)}-${formatSequencePart(sequence)}`;
}
