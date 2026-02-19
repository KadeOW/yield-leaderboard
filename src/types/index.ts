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
