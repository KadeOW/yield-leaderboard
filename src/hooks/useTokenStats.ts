import { useQuery } from '@tanstack/react-query';
import type { TokenStatsResponse } from '@/app/api/tokens/route';

export type { TokenStatsResponse };
export type { TokenStat } from '@/app/api/tokens/route';

export function useTokenStats() {
  return useQuery<TokenStatsResponse>({
    queryKey: ['token-stats'],
    queryFn: async () => {
      const res = await fetch('/api/tokens');
      if (!res.ok) throw new Error('token stats fetch failed');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
