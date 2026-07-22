import { PlanInterval } from '../types';

/**
 * Format an integer minor-unit amount (e.g. cents) + a 3-char lowercase ISO
 * currency code into a localized currency string. Never treat minor units as
 * a float — always divide by 100 here.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(minorUnits / 100);
  } catch {
    // Fall back to a plain amount if the currency code isn't recognized.
    return `${(minorUnits / 100).toFixed(2)} ${code}`;
  }
}

/** ISO 8601 string -> localized date, tolerant of missing/invalid values. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const INTERVAL_LABEL: Record<PlanInterval, string> = {
  [PlanInterval.MONTH]: 'month',
  [PlanInterval.QUARTER]: 'quarter',
  [PlanInterval.YEAR]: 'year',
};

/** Human "per month" style suffix for a plan interval. */
export function intervalLabel(interval: PlanInterval): string {
  return INTERVAL_LABEL[interval] ?? interval;
}

/** Display labels for known feature keys; anything else is humanized generically. */
const FEATURE_LABELS: Record<string, string> = {
  ai: 'AI question generation',
};

/** Turn a feature key like "ai_assistant" into "Ai assistant" for display. */
export function humanizeFeature(key: string): string {
  if (FEATURE_LABELS[key]) return FEATURE_LABELS[key];
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
