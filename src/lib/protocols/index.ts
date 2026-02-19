import type { Position } from '@/types';
import { getAavePositions } from './aave';
import { getMorphoPositions } from './morpho';
import { getAvonPositions } from './avon';
import { getPrismPositions } from './prism';
import { getMockPositions } from './mock';
import { getRegistry } from '@/lib/registry';
import { readERC4626Positions } from './templates/erc4626';
import { readUniV3Positions } from './templates/univ3';

/**
 * Aggregates positions from all supported protocols.
 * - Hardcoded: Aave V3 (Sepolia), Morpho, Avon (MegaETH), Prism (MegaETH)
 * - Dynamic: custom registry entries stored in localStorage
 * Falls back to mock data if no real positions are found.
 */
export async function getAllPositions(address: string): Promise<Position[]> {
  const registryProtocols = getRegistry().filter((p) => p.enabled);

  const registryReaders = registryProtocols.map((config) => {
    if (config.template === 'erc4626') {
      return readERC4626Positions(address, config);
    }
    return readUniV3Positions(address, config);
  });

  const [aave, morpho, avon, prism, ...registryResults] = await Promise.all([
    getAavePositions(address),
    getMorphoPositions(address),
    getAvonPositions(address),
    getPrismPositions(address),
    ...registryReaders,
  ]);

  const real = [...aave, ...morpho, ...avon, ...prism, ...registryResults.flat()];

  // De-duplicate by protocol name + assetAddress
  const seen = new Set<string>();
  const deduped = real.filter((pos) => {
    const key = `${pos.protocol}:${pos.assetAddress.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length > 0) {
    return deduped;
  }

  return getMockPositions(address);
}

export { getMockPositions } from './mock';
