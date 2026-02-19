import { createPublicClient, http, formatUnits } from 'viem';
import type { Position } from '@/types';
import type { ProtocolConfig } from '@/lib/registry';
import { megaEth } from '@/lib/chains';
import { sepolia } from 'wagmi/chains';
import { getTokenAmountsFromLiquidity } from '@/lib/uniswapMath';

const POSITION_MANAGER_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'positions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
] as const;

const FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const;

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const FEE_TIER_APY: Record<number, number> = {
  100: 2,
  500: 8,
  3000: 15,
  10000: 20,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ASSUMED_POSITION_AGE_DAYS = 90;

function clientForChain(chain: 'megaeth' | 'sepolia') {
  if (chain === 'sepolia') {
    return createPublicClient({ chain: sepolia, transport: http('https://sepolia.drpc.org') });
  }
  return createPublicClient({ chain: megaEth, transport: http('https://megaeth.drpc.org') });
}

type PosResult = readonly [
  bigint,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  number,
  number,
  number,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
];

type Slot0Result = readonly [bigint, number, number, number, number, number, boolean];

/**
 * Generic Uniswap V3 fork LP position reader.
 * Reads NFT positions from a configurable positionManager + factory.
 */
export async function readUniV3Positions(
  address: string,
  config: ProtocolConfig,
): Promise<Position[]> {
  const positionManager = config.contracts.positionManager;
  const factory = config.contracts.factory;

  if (!positionManager || !factory) return [];

  const client = clientForChain(config.chain);

  try {
    const nftBalance = await client.readContract({
      address: positionManager as `0x${string}`,
      abi: POSITION_MANAGER_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (nftBalance === BigInt(0)) return [];

    const count = Number(nftBalance);

    const tokenIdResults = await client.multicall({
      contracts: Array.from({ length: count }, (_, i) => ({
        address: positionManager as `0x${string}`,
        abi: POSITION_MANAGER_ABI,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [address as `0x${string}`, BigInt(i)],
      })),
      allowFailure: true,
    });

    const tokenIds = tokenIdResults
      .filter((r) => r.status === 'success')
      .map((r) => r.result as bigint);

    if (tokenIds.length === 0) return [];

    const positionResults = await client.multicall({
      contracts: tokenIds.map((tokenId) => ({
        address: positionManager as `0x${string}`,
        abi: POSITION_MANAGER_ABI,
        functionName: 'positions' as const,
        args: [tokenId],
      })),
      allowFailure: true,
    });

    const validPositions = positionResults
      .filter((r) => r.status === 'success')
      .map((r, i) => {
        const raw = r.result as PosResult;
        return {
          tokenId: tokenIds[i],
          token0: raw[2],
          token1: raw[3],
          fee: raw[4],
          tickLower: raw[5],
          tickUpper: raw[6],
          liquidity: raw[7],
          tokensOwed0: raw[10],
          tokensOwed1: raw[11],
        };
      })
      .filter((p) => p.liquidity > BigInt(0));

    if (validPositions.length === 0) return [];

    const uniqueTokens = new Set<string>();
    validPositions.forEach((p) => {
      uniqueTokens.add(p.token0.toLowerCase());
      uniqueTokens.add(p.token1.toLowerCase());
    });
    const tokenAddresses = [...uniqueTokens];

    const [symbolResults, decimalsResults] = await Promise.all([
      client.multicall({
        contracts: tokenAddresses.map((addr) => ({
          address: addr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol' as const,
        })),
        allowFailure: true,
      }),
      client.multicall({
        contracts: tokenAddresses.map((addr) => ({
          address: addr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals' as const,
        })),
        allowFailure: true,
      }),
    ]);

    const tokenMeta: Record<string, { symbol: string; decimals: number }> = {};
    tokenAddresses.forEach((addr, i) => {
      tokenMeta[addr] = {
        symbol: symbolResults[i].status === 'success' ? (symbolResults[i].result as string) : '???',
        decimals:
          decimalsResults[i].status === 'success'
            ? Number(decimalsResults[i].result as number)
            : 18,
      };
    });

    const poolAddressResults = await client.multicall({
      contracts: validPositions.map((p) => ({
        address: factory as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'getPool' as const,
        args: [p.token0, p.token1, p.fee],
      })),
      allowFailure: true,
    });

    const poolAddresses = poolAddressResults.map((r) =>
      r.status === 'success' ? (r.result as `0x${string}`) : null,
    );

    const slot0Results = await client.multicall({
      contracts: poolAddresses.map((addr) => ({
        address: (addr ?? ZERO_ADDRESS) as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'slot0' as const,
      })),
      allowFailure: true,
    });

    const now = Math.floor(Date.now() / 1000);
    const estimatedEntryTimestamp = now - ASSUMED_POSITION_AGE_DAYS * 86400;
    const positions: Position[] = [];

    for (let i = 0; i < validPositions.length; i++) {
      const pos = validPositions[i];
      const slot0Result = slot0Results[i];
      const poolAddr = poolAddresses[i];

      const t0Key = pos.token0.toLowerCase();
      const t1Key = pos.token1.toLowerCase();
      const t0 = tokenMeta[t0Key];
      const t1 = tokenMeta[t1Key];

      const t0Symbol = t0?.symbol ?? '???';
      const t1Symbol = t1?.symbol ?? '???';
      const t0Decimals = t0?.decimals ?? 18;
      const t1Decimals = t1?.decimals ?? 18;

      let depositedUSD = 0;
      if (slot0Result.status === 'success' && poolAddr && poolAddr !== ZERO_ADDRESS) {
        const slot0 = slot0Result.result as Slot0Result;
        const sqrtPriceX96 = slot0[0];
        const { amount0, amount1 } = getTokenAmountsFromLiquidity(
          pos.liquidity,
          sqrtPriceX96,
          pos.tickLower,
          pos.tickUpper,
        );
        const amount0Human = amount0 / Math.pow(10, t0Decimals);
        const amount1Human = amount1 / Math.pow(10, t1Decimals);
        // Treat token values at $0 unless caller enriches TOKEN_PRICES_USD
        depositedUSD = amount0Human * 0 + amount1Human * 0;
      }

      const fees0Human = parseFloat(formatUnits(pos.tokensOwed0, t0Decimals));
      const fees1Human = parseFloat(formatUnits(pos.tokensOwed1, t1Decimals));
      const yieldEarned = fees0Human * 0 + fees1Human * 0;

      const currentAPY = FEE_TIER_APY[pos.fee] ?? 10;
      const feePct = (pos.fee / 1_000_000) * 100;

      positions.push({
        protocol: config.name,
        protocolLogo: '',
        asset: `${t0Symbol}/${t1Symbol} ${feePct.toFixed(2)}%`,
        assetAddress: poolAddr ?? pos.token0,
        depositedAmount: pos.liquidity,
        depositedUSD,
        currentAPY,
        yieldEarned,
        positionType: config.positionType,
        entryTimestamp: estimatedEntryTimestamp,
      });
    }

    return positions;
  } catch (err) {
    console.error(`[${config.name}] UniV3 read failed:`, err);
    return [];
  }
}

/**
 * Performs a zero-balance test call on the position manager to verify it's reachable.
 */
export async function testUniV3Connection(
  config: Pick<ProtocolConfig, 'contracts' | 'chain'>,
): Promise<boolean> {
  const positionManager = config.contracts.positionManager;
  if (!positionManager) return false;

  const client = clientForChain(config.chain);
  try {
    await client.readContract({
      address: positionManager as `0x${string}`,
      abi: POSITION_MANAGER_ABI,
      functionName: 'balanceOf',
      args: ['0x0000000000000000000000000000000000000001'],
    });
    return true;
  } catch {
    return false;
  }
}
