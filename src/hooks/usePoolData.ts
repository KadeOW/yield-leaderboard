import { useQuery } from '@tanstack/react-query';
import type { PoolInfo, PoolDataResponse } from '@/app/api/pools/route';

export type { PoolInfo, PoolDataResponse };

const THREE_HOURS = 3 * 60 * 60 * 1000;

export function usePoolData() {
  return useQuery<PoolDataResponse>({
    queryKey: ['pool-data'],
    queryFn: async () => {
      const res = await fetch('/api/pools');
      if (!res.ok) throw new Error(`pool data fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: THREE_HOURS,
    gcTime: THREE_HOURS + 30 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Look up the live fee APY for a specific pool by its on-chain address.
 * Returns undefined if the pool isn't in the fetched data.
 */
export function poolAPYByAddress(
  poolData: PoolDataResponse | undefined,
  poolAddress: string | undefined,
): number | undefined {
  if (!poolAddress || !poolData) return undefined;
  const addr = poolAddress.toLowerCase();
  return [...poolData.prism, ...poolData.kumbaya].find(
    (p) => p.address.toLowerCase() === addr,
  )?.apy;
}

/**
 * Returns all pools sorted by descending APY.
 */
export function allPoolsSortedByAPY(poolData: PoolDataResponse | undefined): PoolInfo[] {
  if (!poolData) return [];
  return [...poolData.prism, ...poolData.kumbaya].sort((a, b) => b.apy - a.apy);
}
