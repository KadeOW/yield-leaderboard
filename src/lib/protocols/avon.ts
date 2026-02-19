import { createPublicClient, http, formatUnits } from 'viem';
import type { Position } from '@/types';
import { megaEth } from '@/lib/chains';

/**
 * Avon Finance — ERC-4626 USDM yield vault on MegaETH.
 * Vault: 0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890
 * Underlying: USDM (USD-pegged stablecoin)
 */

const AVON_VAULT = '0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890' as const;
const USDM = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' as const;
const USDM_DECIMALS = 18;
const USDM_PRICE_USD = 1.0;

// Avon doesn't expose an on-chain APY getter; use a conservative estimate
// (typical stablecoin yield vault on MegaETH)
const AVON_APY_ESTIMATE = 8;
const ASSUMED_POSITION_AGE_DAYS = 90;

const megaEthClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

const VAULT_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Reads a user's Avon vault position on MegaETH.
 * Converts shares → USDM using convertToAssets for the true redeemable balance.
 */
export async function getAvonPositions(address: string): Promise<Position[]> {
  try {
    const shares = await megaEthClient.readContract({
      address: AVON_VAULT,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (shares === BigInt(0)) return [];

    const assets = await megaEthClient.readContract({
      address: AVON_VAULT,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [shares],
    });

    const balanceFloat = parseFloat(formatUnits(assets, USDM_DECIMALS));
    const depositedUSD = balanceFloat * USDM_PRICE_USD;

    const now = Math.floor(Date.now() / 1000);
    const estimatedEntryTimestamp = now - ASSUMED_POSITION_AGE_DAYS * 86400;

    const yieldEarned =
      depositedUSD * (AVON_APY_ESTIMATE / 100) * (ASSUMED_POSITION_AGE_DAYS / 365);

    return [
      {
        protocol: 'Avon',
        protocolLogo: '/logos/avon.svg',
        asset: 'USDM',
        assetAddress: USDM,
        depositedAmount: assets,
        depositedUSD,
        currentAPY: AVON_APY_ESTIMATE,
        yieldEarned,
        positionType: 'lending',
        entryTimestamp: estimatedEntryTimestamp,
      },
    ];
  } catch (err) {
    console.error('[Avon] Failed to fetch positions:', err);
    return [];
  }
}
