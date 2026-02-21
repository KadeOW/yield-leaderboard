'use client';

import { useQuery } from '@tanstack/react-query';
import type { WalletNFT } from '@/app/api/nfts/collections/route';

export type { WalletNFT };

async function fetchWalletNFTs(address: string): Promise<WalletNFT[]> {
  const res = await fetch(`/api/nfts/wallet?address=${address}`);
  if (!res.ok) return [];
  return res.json();
}

export function useWalletNFTs(address: string | undefined) {
  return useQuery<WalletNFT[]>({
    queryKey: ['wallet-nfts', address],
    queryFn: () => fetchWalletNFTs(address!),
    enabled: !!address,
    staleTime: 60_000,
    retry: 1,
  });
}
