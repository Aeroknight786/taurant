import {
  calculateCurrentWaitEstimateMin,
  calculateNextWaitEstimateAllocationMin,
  calculateRebasedWaitEstimateMin,
  calculateWaitEstimateMin,
} from '../../src/utils/waitEstimate';

describe('wait estimate helpers', () => {
  it('uses the Subko fixed position formula and caps at 30 minutes', () => {
    expect([
      calculateWaitEstimateMin('SUBKO_FIXED_V1', 1),
      calculateWaitEstimateMin('SUBKO_FIXED_V1', 2),
      calculateWaitEstimateMin('SUBKO_FIXED_V1', 3),
      calculateWaitEstimateMin('SUBKO_FIXED_V1', 4),
      calculateWaitEstimateMin('SUBKO_FIXED_V1', 20),
    ]).toEqual([3, 8, 13, 18, 30]);
  });

  it('uses configurable Subko wait estimate values and caps at the configured max', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect([
      calculateWaitEstimateMin(config, 1),
      calculateWaitEstimateMin(config, 2),
      calculateWaitEstimateMin(config, 3),
      calculateWaitEstimateMin(config, 20),
    ]).toEqual([10, 18, 26, 58]);
  });

  it('decays live Subko wait estimates to the configured floor', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect(calculateCurrentWaitEstimateMin(
      config,
      18,
      new Date('2026-05-08T10:00:00.000Z'),
      new Date('2026-05-08T10:05:00.000Z'),
    )).toBe(13);
    expect(calculateCurrentWaitEstimateMin(
      config,
      18,
      new Date('2026-05-08T10:00:00.000Z'),
      new Date('2026-05-08T10:30:00.000Z'),
    )).toBe(10);
  });

  it('decays live Subko wait estimates to the entry floor that was allocated before config changes', () => {
    const currentConfig = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 25,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect(calculateCurrentWaitEstimateMin(
      currentConfig,
      20,
      new Date('2026-05-08T10:00:00.000Z'),
      new Date('2026-05-08T10:30:00.000Z'),
      20,
    )).toBe(20);
  });

  it('allocates the next live Subko wait from the previous remaining wait', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect(calculateNextWaitEstimateAllocationMin(config, null, 1)).toBe(10);
    expect(calculateNextWaitEstimateAllocationMin(config, 13, 3)).toBe(21);
    expect(calculateNextWaitEstimateAllocationMin(config, 57, 8)).toBe(58);
  });

  it('uses static position estimates when live wait countdown is disabled', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: false,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect(calculateCurrentWaitEstimateMin(
      config,
      18,
      new Date('2026-05-08T10:00:00.000Z'),
      new Date('2026-05-08T10:05:00.000Z'),
    )).toBe(18);
    expect(calculateNextWaitEstimateAllocationMin(config, 13, 3)).toBe(26);
  });

  it('rebases live Subko wait estimates from the queue head', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    };

    expect([
      calculateRebasedWaitEstimateMin(config, 0),
      calculateRebasedWaitEstimateMin(config, 1),
      calculateRebasedWaitEstimateMin(config, 2),
      calculateRebasedWaitEstimateMin(config, 20),
    ]).toEqual([10, 18, 26, 58]);
  });

  it('rebases existing entries with their stored formula snapshot', () => {
    const currentConfig = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 25,
      waitEstimateStepMin: 15,
      waitEstimateMaxMin: 60,
    };

    expect(calculateRebasedWaitEstimateMin(currentConfig, 0, {
      waitEstimateFloorMin: 20,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    })).toBe(20);
    expect(calculateRebasedWaitEstimateMin(currentConfig, 1, {
      waitEstimateFloorMin: 20,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 58,
    })).toBe(28);
  });

  it('normalizes max wait below base wait so app and notifications cannot diverge', () => {
    const config = {
      guestWaitFormula: 'SUBKO_FIXED_V1' as const,
      waitEstimateDecayEnabled: true,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 5,
    };

    expect(calculateWaitEstimateMin(config, 1)).toBe(10);
    expect(calculateCurrentWaitEstimateMin(
      config,
      5,
      '2026-05-08T10:00:00.000Z',
      new Date('2026-05-08T10:05:00.000Z'),
    )).toBe(10);
    expect(calculateNextWaitEstimateAllocationMin(config, 10, 2)).toBe(10);
  });

  it('keeps the legacy heuristic unchanged for non-Subko venues', () => {
    expect(calculateWaitEstimateMin('LEGACY_TURN_HEURISTIC', 1)).toBe(39);
    expect(calculateWaitEstimateMin('LEGACY_TURN_HEURISTIC', 2)).toBe(77);
  });
});
