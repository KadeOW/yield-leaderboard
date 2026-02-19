'use client';

import { useMemo } from 'react';
import type { Position } from '@/types';
import { calculateYieldScore, deriveStrategyTags } from '@/lib/scoring';

export function useYieldData(positions: Position[] | undefined) {
  return useMemo(() => {
    if (!positions || positions.length === 0) {
      return {
        totalDeposited: 0,
        totalYieldEarned: 0,
        weightedAPY: 0,
        yieldScore: 0,
        strategyTags: [],
      };
    }

    const totalDeposited = positions.reduce((sum, p) => sum + p.depositedUSD, 0);
    const totalYieldEarned = positions.reduce((sum, p) => sum + p.yieldEarned, 0);
    const weightedAPY =
      totalDeposited > 0
        ? positions.reduce((sum, p) => sum + p.currentAPY * p.depositedUSD, 0) / totalDeposited
        : 0;

    const yieldScore = calculateYieldScore(positions);
    const strategyTags = deriveStrategyTags(positions);

    return { totalDeposited, totalYieldEarned, weightedAPY, yieldScore, strategyTags };
  }, [positions]);
}
