type Interval = "15s" | "30s" | "1m" | "5m";

const INTERVAL_MS: Record<Interval, number> = {
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
};

let currentInterval: Interval = "30s";
let listeners: Array<(ms: number) => void> = [];

export function getRefreshMs(): number {
  return INTERVAL_MS[currentInterval];
}

export function setRefreshInterval(interval: Interval) {
  currentInterval = interval;
  listeners.forEach((fn) => fn(INTERVAL_MS[interval]));
}

export function subscribeRefresh(fn: (ms: number) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
