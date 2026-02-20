export interface Position {
  protocol: string;
  protocolLogo: string;
  asset: string;
  assetAddress: string;
  depositedAmount: bigint;
  depositedUSD: number;
  currentAPY: number;
  yieldEarned: number;
  positionType: 'lending' | 'staking' | 'lp' | 'bond';
  entryTimestamp: number;
  inRange?: boolean; // LP positions only — undefined for non-LP
  // LP range details (Uniswap V3 style) — only present when positionType === 'lp'
  tickLower?: number;
  tickUpper?: number;
  tickCurrent?: number;
  token0Decimals?: number;
  token1Decimals?: number;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Amount?: number;     // human-readable token0 amount in position
  token1Amount?: number;     // human-readable token1 amount in position
  token0PriceUSD?: number;   // live USD price of token0 (0 if unknown)
  token1PriceUSD?: number;   // live USD price of token1 (0 if unknown)
  feeToken0Amount?: number;  // claimable token0 fees (human-readable)
  feeToken1Amount?: number;  // claimable token1 fees (human-readable)
}

export interface UserProfile {
  address: string;
  ensName?: string;
  positions: Position[];
  totalDeposited: number;
  totalYieldEarned: number;
  weightedAPY: number;
  yieldScore: number;
  rank: number;
  strategyTags: string[];
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  ensName?: string;
  yieldScore: number;
  totalDeposited: number;
  weightedAPY: number;
  topProtocol: string;
  strategyTags: string[];
}
