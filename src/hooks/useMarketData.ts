import { useQuery } from '@tanstack/react-query';
import type { MarketDataResponse } from '@/app/api/market/route';

export type { MarketDataResponse };

export function useMarketData() {
  return useQuery<MarketDataResponse>({
    queryKey: ['market-data'],
    queryFn: async () => {
      const res = await fetch('/api/market');
      if (!res.ok) throw new Error('market fetch failed');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
