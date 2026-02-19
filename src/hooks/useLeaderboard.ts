'use client';

import { useQuery } from '@tanstack/react-query';
import type { LeaderboardEntry } from '@/types';
import { generateMockLeaderboard } from '@/lib/mockLeaderboard';

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: generateMockLeaderboard,
    staleTime: 60_000,
  });
}
