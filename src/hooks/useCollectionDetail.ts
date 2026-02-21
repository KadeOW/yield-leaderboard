'use client';

import { useQuery } from '@tanstack/react-query';
import type { CollectionDetailResponse } from '@/app/api/nfts/collections/route';

export type { CollectionDetailResponse };

async function fetchCollectionDetail(slug: string): Promise<CollectionDetailResponse> {
  const res = await fetch(`/api/nfts/collection/${slug}`);
  if (!res.ok) throw new Error(`Failed to fetch collection: ${slug}`);
  return res.json();
}

export function useCollectionDetail(slug: string | null) {
  return useQuery<CollectionDetailResponse>({
    queryKey: ['nft-collection-detail', slug],
    queryFn: () => fetchCollectionDetail(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
