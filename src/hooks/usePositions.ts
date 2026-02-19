'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { getAllPositions } from '@/lib/protocols';
import type { Position } from '@/types';

export function usePositions() {
  const { address, isConnected } = useAccount();

  return useQuery<Position[]>({
    queryKey: ['positions', address],
    queryFn: () => getAllPositions(address!),
    enabled: isConnected && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
