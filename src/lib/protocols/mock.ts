import type { Position } from '@/types';

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const MOCK_POSITIONS: Position[] = [
  {
    protocol: 'Aave V3',
    protocolLogo: '/logos/aave.svg',
    asset: 'USDC',
    assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    depositedAmount: BigInt(50000) * BigInt(10 ** 6),
    depositedUSD: 50000,
    currentAPY: 5.4,
    yieldEarned: 1350,
    positionType: 'lending',
    entryTimestamp: NOW - 180 * DAY,
  },
  {
    protocol: 'Morpho',
    protocolLogo: '/logos/morpho.svg',
    asset: 'WETH',
    assetAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    depositedAmount: BigInt(10) * BigInt(10 ** 18),
    depositedUSD: 30000,
    currentAPY: 3.8,
    yieldEarned: 570,
    positionType: 'lending',
    entryTimestamp: NOW - 90 * DAY,
  },
  {
    protocol: 'Lido',
    protocolLogo: '/logos/lido.svg',
    asset: 'stETH',
    assetAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    depositedAmount: BigInt(5) * BigInt(10 ** 18),
    depositedUSD: 15000,
    currentAPY: 4.1,
    yieldEarned: 308,
    positionType: 'staking',
    entryTimestamp: NOW - 120 * DAY,
  },
  {
    protocol: 'Uniswap V3',
    protocolLogo: '/logos/uniswap.svg',
    asset: 'ETH/USDC',
    assetAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
    depositedAmount: BigInt(0),
    depositedUSD: 20000,
    currentAPY: 18.7,
    yieldEarned: 1870,
    positionType: 'lp',
    entryTimestamp: NOW - 60 * DAY,
  },
];

/**
 * Returns deterministic mock positions for a given address.
 * Varies the data slightly per address so different wallets look different.
 */
export function getMockPositions(address: string): Position[] {
  const seed = parseInt(address.slice(2, 6), 16) || 1;
  const count = (seed % 3) + 2; // 2 to 4 positions

  return MOCK_POSITIONS.slice(0, count).map((p) => ({
    ...p,
    depositedUSD: Math.round(p.depositedUSD * (0.5 + (seed % 10) / 10)),
    currentAPY: parseFloat((p.currentAPY * (0.8 + (seed % 5) / 10)).toFixed(2)),
    yieldEarned: Math.round(p.yieldEarned * (0.5 + (seed % 10) / 10)),
  }));
}
