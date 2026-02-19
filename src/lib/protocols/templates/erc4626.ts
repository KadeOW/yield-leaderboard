import { createPublicClient, http, formatUnits } from 'viem';
import type { Position } from '@/types';
import type { ProtocolConfig } from '@/lib/registry';
import { megaEth } from '@/lib/chains';
import { sepolia } from 'wagmi/chains';

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

const ASSUMED_POSITION_AGE_DAYS = 90;

function clientForChain(chain: 'megaeth' | 'sepolia') {
  if (chain === 'sepolia') {
    return createPublicClient({ chain: sepolia, transport: http('https://sepolia.drpc.org') });
  }
  return createPublicClient({ chain: megaEth, transport: http('https://megaeth.drpc.org') });
}

/**
 * Generic ERC-4626 vault position reader.
 * Reads shares, converts to assets, and returns a Position using config metadata.
 */
export async function readERC4626Positions(
  address: string,
  config: ProtocolConfig,
): Promise<Position[]> {
  const vaultAddress = config.contracts.vault;
  const underlying = config.underlyingToken;

  if (!vaultAddress || !underlying) return [];

  const client = clientForChain(config.chain);

  try {
    const shares = await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (shares === BigInt(0)) return [];

    const assets = await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [shares],
    });

    const balanceFloat = parseFloat(formatUnits(assets, underlying.decimals));
    const depositedUSD = balanceFloat * underlying.priceUSD;

    const now = Math.floor(Date.now() / 1000);
    const estimatedEntryTimestamp = now - ASSUMED_POSITION_AGE_DAYS * 86400;
    const yieldEarned =
      depositedUSD * (config.apyEstimate / 100) * (ASSUMED_POSITION_AGE_DAYS / 365);

    return [
      {
        protocol: config.name,
        protocolLogo: '',
        asset: underlying.symbol,
        assetAddress: underlying.address,
        depositedAmount: assets,
        depositedUSD,
        currentAPY: config.apyEstimate,
        yieldEarned,
        positionType: config.positionType,
        entryTimestamp: estimatedEntryTimestamp,
      },
    ];
  } catch (err) {
    console.error(`[${config.name}] ERC-4626 read failed:`, err);
    return [];
  }
}

/**
 * Performs a zero-balance test call to verify the vault contract is reachable.
 * Returns true if the contract responds without error.
 */
export async function testERC4626Connection(
  config: Pick<ProtocolConfig, 'contracts' | 'chain'>,
): Promise<boolean> {
  const vaultAddress = config.contracts.vault;
  if (!vaultAddress) return false;

  const client = clientForChain(config.chain);
  try {
    await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: ['0x0000000000000000000000000000000000000001'],
    });
    return true;
  } catch {
    return false;
  }
}
