const SYMBOL_MAP: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  ILS: "₪",
  JPY: "¥",
};

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  ILS: 3.63,
  JPY: 149.5,
};

let currentCurrency = "USD";
let exchangeRates: Record<string, number> = { ...FALLBACK_RATES };
let listeners: Array<(currency: string) => void> = [];

export function getCurrency(): string {
  return currentCurrency;
}

export function getCurrencySymbol(): string {
  return SYMBOL_MAP[currentCurrency] ?? "$";
}

export function convertPrice(usdValue: number): number {
  const rate = exchangeRates[currentCurrency] ?? 1;
  return usdValue * rate;
}

export function formatPrice(usdValue: number, decimals = 2): string {
  const converted = convertPrice(usdValue);
  return `${getCurrencySymbol()}${converted.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

async function fetchRates(): Promise<void> {
  if (currentCurrency === "USD") return;
  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=USD&symbols=${currentCurrency}`,
    );
    const json = await res.json();
    if (json?.rates?.[currentCurrency]) {
      exchangeRates[currentCurrency] = json.rates[currentCurrency];
    }
  } catch {
    // Network failed — keep fallback rates
  }
}

export async function setCurrency(currency: string) {
  currentCurrency = currency;
  await fetchRates();
  listeners.forEach((fn) => fn(currency));
}

export function subscribeCurrency(fn: (currency: string) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
