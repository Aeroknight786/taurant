import { calculateWaitEstimateMin } from '../../src/utils/waitEstimate';

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
      waitEstimateMaxMin: 60,
    };

    expect([
      calculateWaitEstimateMin(config, 1),
      calculateWaitEstimateMin(config, 2),
      calculateWaitEstimateMin(config, 3),
      calculateWaitEstimateMin(config, 20),
    ]).toEqual([10, 18, 26, 60]);
  });

  it('keeps the legacy heuristic unchanged for non-Subko venues', () => {
    expect(calculateWaitEstimateMin('LEGACY_TURN_HEURISTIC', 1)).toBe(39);
    expect(calculateWaitEstimateMin('LEGACY_TURN_HEURISTIC', 2)).toBe(77);
  });
});
