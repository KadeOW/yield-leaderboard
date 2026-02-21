'use client';

import { useQuery } from '@tanstack/react-query';
import type { HuntertalesData } from '@/app/api/games/huntertales/route';

export type { HuntertalesData };

async function fetchHuntertales(): Promise<HuntertalesData> {
  const res = await fetch('/api/games/huntertales');
  if (!res.ok) throw new Error('Failed to fetch Huntertales data');
  return res.json();
}

export function useHuntertales() {
  return useQuery<HuntertalesData>({
    queryKey: ['huntertales'],
    queryFn: fetchHuntertales,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
