import type { LeaderboardEntry } from '@/types';

const PROTOCOLS = ['Aave V3', 'Morpho', 'Lido', 'Uniswap V3', 'Compound V3', 'Spark'];
const TAGS = [
  ['Diversified', 'High Yield', 'LP Provider'],
  ['Conservative', 'Lender', 'Long-term Holder'],
  ['Staker', 'Single Protocol'],
  ['Diversified', 'Staker', 'Lender'],
  ['High Yield', 'LP Provider'],
  ['Conservative', 'Diversified'],
];

const ENS_NAMES = [
  'vitalik.eth',
  'hayden.eth',
  'defi.eth',
  'whale.eth',
  'yield.eth',
  null,
  null,
  null,
  null,
  null,
];

function mockAddress(seed: number): string {
  const hex = seed.toString(16).padStart(40, '0');
  return `0x${hex}`;
}

export async function generateMockLeaderboard(): Promise<LeaderboardEntry[]> {
  return Array.from({ length: 50 }, (_, i) => {
    const rank = i + 1;
    const seed = (rank * 7919) % 10000;
    const score = Math.max(5, 100 - rank * 1.8 + (seed % 5));
    const tvl = Math.max(1000, 500000 / rank + (seed % 10000));
    const apy = Math.max(1, 20 - rank * 0.3 + (seed % 5));

    return {
      rank,
      address: mockAddress(seed + 1000),
      ensName: i < ENS_NAMES.length ? (ENS_NAMES[i] ?? undefined) : undefined,
      yieldScore: Math.round(score),
      totalDeposited: Math.round(tvl),
      weightedAPY: parseFloat(apy.toFixed(2)),
      topProtocol: PROTOCOLS[seed % PROTOCOLS.length],
      strategyTags: TAGS[seed % TAGS.length],
    };
  });
}
