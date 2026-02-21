'use client';

import { useQuery } from '@tanstack/react-query';
import type { NFTCollection } from '@/app/api/nfts/collections/route';

export type { NFTCollection };

async function fetchCollections(): Promise<NFTCollection[]> {
  const res = await fetch('/api/nfts/collections');
  if (!res.ok) return [];
  return res.json();
}

export function useNFTCollections() {
  return useQuery<NFTCollection[]>({
    queryKey: ['nft-collections'],
    queryFn: fetchCollections,
    staleTime: 90_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });
}
