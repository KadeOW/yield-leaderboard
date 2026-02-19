import type { Position } from '@/types';
import { positionAgeDays, clamp } from './utils';

/**
 * Calculate the Yield Score (0-100) for a set of positions
 *
 * yieldScore = (
 *   (weightedAPY_normalized * 35) +
 *   (diversification_score * 25) +
 *   (consistency_score * 20) +
 *   (capital_efficiency * 20)
 * )
 */
export function calculateYieldScore(positions: Position[]): number {
  if (positions.length === 0) return 0;

  const totalDeposited = positions.reduce((sum, p) => sum + p.depositedUSD, 0);
  if (totalDeposited === 0) return 0;

  // Weighted APY
  const weightedAPY =
    positions.reduce((sum, p) => sum + p.currentAPY * p.depositedUSD, 0) / totalDeposited;
  const weightedAPY_normalized = clamp(weightedAPY / 25, 0, 1);

  // Diversification: unique protocols / 5, capped at 1
  const uniqueProtocols = new Set(positions.map((p) => p.protocol)).size;
  const diversification_score = clamp(uniqueProtocols / 5, 0, 1);

  // Consistency: average position age in days / 90, capped at 1
  const avgAgeDays =
    positions.reduce((sum, p) => sum + positionAgeDays(p.entryTimestamp), 0) / positions.length;
  const consistency_score = clamp(avgAgeDays / 90, 0, 1);

  // Capital efficiency: total yield earned / total deposited, normalized
  const totalYieldEarned = positions.reduce((sum, p) => sum + p.yieldEarned, 0);
  const rawEfficiency = totalDeposited > 0 ? totalYieldEarned / totalDeposited : 0;
  const capital_efficiency = clamp(rawEfficiency / 0.1, 0, 1); // 10% yield = max score

  const score =
    weightedAPY_normalized * 35 +
    diversification_score * 25 +
    consistency_score * 20 +
    capital_efficiency * 20;

  return Math.round(clamp(score, 0, 100));
}

/**
 * Derive strategy tags from positions
 */
export function deriveStrategyTags(positions: Position[]): string[] {
  const tags: string[] = [];

  const protocols = new Set(positions.map((p) => p.protocol));
  const positionTypes = new Set(positions.map((p) => p.positionType));

  if (protocols.size >= 3) tags.push('Diversified');
  if (protocols.size === 1) tags.push('Single Protocol');
  if (positionTypes.has('staking')) tags.push('Staker');
  if (positionTypes.has('lp')) tags.push('LP Provider');
  if (positionTypes.has('lending')) tags.push('Lender');

  const avgAPY =
    positions.reduce((sum, p) => sum + p.currentAPY, 0) / (positions.length || 1);
  if (avgAPY > 15) tags.push('High Yield');
  if (avgAPY < 5) tags.push('Conservative');

  const avgAge =
    positions.reduce(
      (sum, p) => sum + (Date.now() / 1000 - p.entryTimestamp) / 86400,
      0
    ) / (positions.length || 1);
  if (avgAge > 180) tags.push('Long-term Holder');

  return tags.slice(0, 4);
}
