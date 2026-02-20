'use client';

import { useQuery } from '@tanstack/react-query';
import type { TokenHolding } from '@/hooks/useWalletPortfolio';
import type { DayPoint } from '@/app/api/portfolio-history/route';

const FIVE_MIN = 5 * 60_000;

export type { DayPoint };

export function usePortfolioHistory(
  holdings: TokenHolding[] | undefined,
  positionsValue: number,
) {
  // Encode holdings into a stable, compact string for the query key and URL param.
  // Round values to reduce cache churn from tiny balance fluctuations.
  const encoded =
    holdings && holdings.length > 0
      ? JSON.stringify(
          holdings.map((h) => ({
            address: h.address,
            balance: +h.balance.toFixed(6),
            priceUSD: +h.priceUSD.toFixed(4),
          })),
        )
      : null;

  return useQuery<DayPoint[]>({
    queryKey: ['portfolio-history', encoded, Math.round(positionsValue)],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio-history?h=${encodeURIComponent(encoded!)}&pv=${positionsValue.toFixed(2)}`,
      );
      if (!res.ok) throw new Error('portfolio-history fetch failed');
      const data: { points: DayPoint[] } = await res.json();
      return data.points;
    },
    enabled: !!encoded,
    staleTime: FIVE_MIN,
    gcTime: FIVE_MIN * 3,
    retry: 1,
  });
}
