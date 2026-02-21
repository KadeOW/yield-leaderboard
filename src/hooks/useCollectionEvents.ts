'use client';

import { useQuery } from '@tanstack/react-query';
import type { CollectionEventsResponse } from '@/app/api/nfts/collection/[slug]/events/route';

export type { CollectionEventsResponse };

async function fetchCollectionEvents(slug: string): Promise<CollectionEventsResponse> {
  const res = await fetch(`/api/nfts/collection/${slug}/events`);
  if (!res.ok) throw new Error(`Failed to fetch events for ${slug}`);
  return res.json();
}

export function useCollectionEvents(slug: string | null) {
  return useQuery<CollectionEventsResponse>({
    queryKey: ['nft-collection-events', slug],
    queryFn: () => fetchCollectionEvents(slug!),
    enabled: !!slug,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
