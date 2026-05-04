export type VenueGuestWaitFormula = 'LEGACY_TURN_HEURISTIC' | 'SUBKO_FIXED_V1';

const AVG_TURN_MINUTES = 55;

export function calculateWaitEstimateMin(guestWaitFormula: VenueGuestWaitFormula | undefined, position: number): number {
  const numericPosition = Number.isFinite(position) ? Math.floor(position) : 1;
  const safePosition = Math.max(1, numericPosition);

  if (guestWaitFormula === 'SUBKO_FIXED_V1') {
    return Math.max(3, Math.min(3 + (5 * (safePosition - 1)), 30));
  }

  return Math.ceil(safePosition * AVG_TURN_MINUTES * 0.7);
}
