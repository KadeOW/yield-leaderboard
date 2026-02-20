import { useQuery } from '@tanstack/react-query';
import type { PoolStatsResponse } from '@/app/api/pool-stats/route';

const FIVE_MIN = 5 * 60_000;

/**
 * Fetches fresh GeckoTerminal pool stats for a set of LP pool addresses.
 * Calls /api/pool-stats per pool, cached 5 minutes, auto-refreshed every 5 minutes.
 * Returns a map of lowercase address → fee APY (%).
 */
export function usePoolLiveStats(addresses: string[]): Map<string, number> {
  // Deduplicate and sort for a stable query key
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].sort();

  const { data } = useQuery<Map<string, number>>({
    queryKey: ['pool-live-stats', unique.join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled(
        unique.map((addr) =>
          fetch(`/api/pool-stats?address=${addr}`)
            .then((r) => r.json() as Promise<PoolStatsResponse>),
        ),
      );

      const map = new Map<string, number>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.apy > 0) {
          map.set(unique[i], r.value.apy);
        }
      });
      return map;
    },
    enabled: unique.length > 0,
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: false,
    gcTime: FIVE_MIN + 60_000,
  });

  return data ?? new Map();
}
