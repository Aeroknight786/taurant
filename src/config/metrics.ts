type MetricCounterName = 'http_429_total' | 'http_5xx_total' | 'dashboard_soft_fail_total';

const counters = new Map<string, number>();

function serialiseLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

export function incrementCounter(name: MetricCounterName, labels: Record<string, string>, value = 1): void {
  const key = `${name}|${serialiseLabels(labels)}`;
  counters.set(key, (counters.get(key) || 0) + value);
}

export function getCountersSnapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

