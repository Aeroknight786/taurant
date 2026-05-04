export type VenueGuestWaitFormula = 'LEGACY_TURN_HEURISTIC' | 'SUBKO_FIXED_V1';

const AVG_TURN_MINUTES = 55;
const DEFAULT_SUBKO_WAIT_BASE_MIN = 3;
const DEFAULT_SUBKO_WAIT_STEP_MIN = 5;
const DEFAULT_SUBKO_WAIT_MAX_MIN = 30;

export type WaitEstimateConfig = {
  guestWaitFormula?: VenueGuestWaitFormula;
  waitEstimateBaseMin?: number | null;
  waitEstimateStepMin?: number | null;
  waitEstimateMaxMin?: number | null;
};

type WaitEstimateInput = VenueGuestWaitFormula | WaitEstimateConfig | null | undefined;
type ResolvedWaitEstimateConfig = {
  guestWaitFormula: VenueGuestWaitFormula;
  waitEstimateBaseMin: number;
  waitEstimateStepMin: number;
  waitEstimateMaxMin: number;
};

function getNumericConfigValue(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function resolveWaitEstimateConfig(input: WaitEstimateInput): ResolvedWaitEstimateConfig {
  if (typeof input === 'string') {
    return {
      guestWaitFormula: input,
      waitEstimateBaseMin: DEFAULT_SUBKO_WAIT_BASE_MIN,
      waitEstimateStepMin: DEFAULT_SUBKO_WAIT_STEP_MIN,
      waitEstimateMaxMin: DEFAULT_SUBKO_WAIT_MAX_MIN,
    };
  }

  const maxMin = getNumericConfigValue(input?.waitEstimateMaxMin, DEFAULT_SUBKO_WAIT_MAX_MIN);
  return {
    guestWaitFormula: input?.guestWaitFormula ?? 'LEGACY_TURN_HEURISTIC',
    waitEstimateBaseMin: getNumericConfigValue(input?.waitEstimateBaseMin, DEFAULT_SUBKO_WAIT_BASE_MIN),
    waitEstimateStepMin: getNumericConfigValue(input?.waitEstimateStepMin, DEFAULT_SUBKO_WAIT_STEP_MIN),
    waitEstimateMaxMin: Math.max(1, maxMin),
  };
}

export function calculateWaitEstimateMin(configInput: WaitEstimateInput, position: number): number {
  const numericPosition = Number.isFinite(position) ? Math.floor(position) : 1;
  const safePosition = Math.max(1, numericPosition);
  const config = resolveWaitEstimateConfig(configInput);

  if (config.guestWaitFormula === 'SUBKO_FIXED_V1') {
    return Math.min(
      config.waitEstimateMaxMin,
      config.waitEstimateBaseMin + (config.waitEstimateStepMin * (safePosition - 1)),
    );
  }

  return Math.ceil(safePosition * AVG_TURN_MINUTES * 0.7);
}
