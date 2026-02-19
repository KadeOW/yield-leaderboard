import { readUniV3Positions } from './templates/univ3';
import type { Position } from '@/types';
import type { ProtocolConfig } from '@/lib/registry';

/**
 * Kumbaya — Uniswap V3 fork LP positions on MegaETH.
 * NonfungiblePositionManager: 0x2b781C57e6358f64864Ff8EC464a03Fdaf9974bA
 * Factory:                    0x68b34591f662508076927803c567cc8006988a09
 */

const KUMBAYA_CONFIG: ProtocolConfig = {
  id: '__kumbaya',
  name: 'Kumbaya',
  logoEmoji: '🌊',
  template: 'univ3',
  enabled: true,
  chain: 'megaeth',
  contracts: {
    positionManager: '0x2b781C57e6358f64864Ff8EC464a03Fdaf9974bA',
    factory: '0x68b34591f662508076927803c567cc8006988a09',
  },
  apyEstimate: 10,
  positionType: 'lp',
  addedAt: 0,
};

export async function getKumbayaPositions(address: string): Promise<Position[]> {
  return readUniV3Positions(address, KUMBAYA_CONFIG);
}

export { KUMBAYA_CONFIG };
