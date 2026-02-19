import { readUniV3Positions } from './templates/univ3';
import type { Position } from '@/types';
import type { ProtocolConfig } from '@/lib/registry';

/**
 * Prism Finance — Uniswap V3 fork LP positions on MegaETH.
 * NonfungiblePositionManager: 0xcb91c75a6b29700756d4411495be696c4e9a576e
 * Factory: 0x1adb8f973373505bb206e0e5d87af8fb1f5514ef
 */

const PRISM_CONFIG: ProtocolConfig = {
  id: '__prism',
  name: 'Prism',
  logoEmoji: '💎',
  template: 'univ3',
  enabled: true,
  chain: 'megaeth',
  contracts: {
    positionManager: '0xcb91c75a6b29700756d4411495be696c4e9a576e',
    factory: '0x1adb8f973373505bb206e0e5d87af8fb1f5514ef',
  },
  apyEstimate: 15,
  positionType: 'lp',
  addedAt: 0,
};

export async function getPrismPositions(address: string): Promise<Position[]> {
  return readUniV3Positions(address, PRISM_CONFIG);
}
