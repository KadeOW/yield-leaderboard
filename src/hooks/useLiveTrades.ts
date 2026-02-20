import { useQuery } from '@tanstack/react-query';
import type { TradesResponse } from '@/app/api/trades/route';

export type { TradesResponse };

export function useLiveTrades() {
  return useQuery<TradesResponse>({
    queryKey: ['live-trades'],
    queryFn: async () => {
      const res = await fetch('/api/trades');
      if (!res.ok) throw new Error('trades fetch failed');
      return res.json();
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
