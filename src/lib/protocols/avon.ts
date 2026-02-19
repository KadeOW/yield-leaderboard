import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
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

// ERC-20 Transfer event (used to find when shares were first minted to the user)
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/**
 * Returns the unix timestamp of the user's first deposit into the vault
 * by finding the earliest ERC-20 share mint (Transfer from 0x0 to user).
 * Falls back to 1 day ago if the query fails or returns no results.
 */
async function getFirstDepositTimestamp(address: string): Promise<number> {
  try {
    const logs = await megaEthClient.getLogs({
      address: AVON_VAULT,
      event: TRANSFER_EVENT,
      args: {
        from: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        to: address as `0x${string}`,
      },
      fromBlock: 0n,
      toBlock: 'latest',
    });

    if (logs.length > 0 && logs[0].blockNumber != null) {
      const block = await megaEthClient.getBlock({ blockNumber: logs[0].blockNumber });
      return Number(block.timestamp);
    }
  } catch {}
  return Math.floor(Date.now() / 1000) - 86400; // fallback: 1 day ago
}

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

    const entryTimestamp = await getFirstDepositTimestamp(address);
    const ageSeconds = Math.floor(Date.now() / 1000) - entryTimestamp;
    const ageDays = Math.max(ageSeconds / 86400, 0);

    const yieldEarned = depositedUSD * (AVON_APY_ESTIMATE / 100) * (ageDays / 365);

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
        entryTimestamp,
      },
    ];
  } catch (err) {
    console.error('[Avon] Failed to fetch positions:', err);
    return [];
  }
}
