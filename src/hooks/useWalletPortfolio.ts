'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { createPublicClient, http, formatUnits } from 'viem';
import { megaEth } from '@/lib/chains';
import { usePoolData } from '@/hooks/usePoolData';
import type { TokenInfo } from '@/app/api/pools/route';

export interface TokenHolding {
  address: string;   // '0x...' or 'native'
  symbol: string;
  decimals: number;
  logo?: string;
  balance: number;   // human-readable (already divided by decimals)
  priceUSD: number;
  valueUSD: number;
}

const megaClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function fetchPortfolio(
  walletAddress: string,
  tokens: Record<string, TokenInfo>,
): Promise<{ holdings: TokenHolding[]; totalValueUSD: number }> {
  const tokenList = Object.values(tokens);

  // Fetch native ETH balance + all ERC-20 balances in parallel
  const [nativeBalance, erc20Results] = await Promise.all([
    megaClient.getBalance({ address: walletAddress as `0x${string}` }).catch(() => 0n),
    tokenList.length > 0
      ? megaClient.multicall({
          contracts: tokenList.map((t) => ({
            address: t.address as `0x${string}`,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf' as const,
            args: [walletAddress as `0x${string}`],
          })),
          allowFailure: true,
        })
      : Promise.resolve([]),
  ]);

  const holdings: TokenHolding[] = [];

  // Native ETH
  const ethBalance = Number(formatUnits(nativeBalance, 18));
  // Find ETH/WETH price from token list
  const wethEntry = Object.values(tokens).find(
    (t) => t.symbol === 'WETH' || t.address === '0x4200000000000000000000000000000000000006',
  );
  const ethPrice = wethEntry?.priceUSD ?? 0;
  if (ethBalance > 0.00001) {
    holdings.push({
      address: 'native',
      symbol: 'ETH',
      decimals: 18,
      logo: wethEntry?.logo,
      balance: ethBalance,
      priceUSD: ethPrice,
      valueUSD: ethBalance * ethPrice,
    });
  }

  // ERC-20 tokens
  tokenList.forEach((token, i) => {
    const result = erc20Results[i];
    if (result?.status !== 'success') return;
    const raw = result.result as bigint;
    if (raw === 0n) return;

    const balance = Number(formatUnits(raw, token.decimals));
    if (balance < 0.000001) return;

    holdings.push({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      logo: token.logo,
      balance,
      priceUSD: token.priceUSD,
      valueUSD: balance * token.priceUSD,
    });
  });

  // Sort by USD value descending
  holdings.sort((a, b) => b.valueUSD - a.valueUSD);

  const totalValueUSD = holdings.reduce((s, h) => s + h.valueUSD, 0);
  return { holdings, totalValueUSD };
}

export function useWalletPortfolio() {
  const { address, isConnected } = useAccount();
  const { data: poolData } = usePoolData();

  return useQuery({
    queryKey: ['wallet-portfolio', address, Object.keys(poolData?.tokens ?? {}).length],
    queryFn: () => fetchPortfolio(address!, poolData?.tokens ?? {}),
    enabled: isConnected && !!address && !!poolData,
    staleTime: 60_000,        // refresh every 60s (balances change frequently)
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
