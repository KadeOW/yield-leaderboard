/**
 * Format a USD value with commas and 2 decimal places
 */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a large USD value with K/M/B suffix
 */
export function formatUSDCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return formatUSD(value);
}

/**
 * Format an APY percentage
 */
export function formatAPY(apy: number): string {
  return `${apy.toFixed(2)}%`;
}

/**
 * Format a token amount with commas and specified decimals
 */
export function formatTokenAmount(amount: bigint, decimals = 18, displayDecimals = 2): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const decimal = Number(remainder) / Number(divisor);
  const total = Number(whole) + decimal;
  return total.toLocaleString('en-US', {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}

/**
 * Truncate an Ethereum address for display
 */
export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Calculate position age in days from entry timestamp
 */
export function positionAgeDays(entryTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const ageSecs = now - entryTimestamp;
  return Math.floor(ageSecs / 86400);
}

/**
 * Format position age as a human-readable string
 */
export function formatPositionAge(entryTimestamp: number): string {
  const days = positionAgeDays(entryTimestamp);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year' : `${years} years`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get the color class for a yield score (0-100)
 */
export function scoreColor(score: number): string {
  if (score >= 80) return 'text-accent';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}
