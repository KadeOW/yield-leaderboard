import { createPublicClient, http, formatUnits } from 'viem';
import type { Position } from '@/types';
import { megaEth } from '@/lib/chains';

/**
 * Prism Finance — Uniswap V3 fork LP positions on MegaETH.
 * NonfungiblePositionManager: 0xcb91c75a6b29700756d4411495be696c4e9a576e
 * Factory: 0x1adb8f973373505bb206e0e5d87af8fb1f5514ef
 */

const PRISM_POSITION_MANAGER = '0xcb91c75a6b29700756d4411495be696c4e9a576e' as const;
const PRISM_FACTORY = '0x1adb8f973373505bb206e0e5d87af8fb1f5514ef' as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ASSUMED_POSITION_AGE_DAYS = 90;

// Estimated APY by fee tier — actual yield depends on volume, shown as rough proxy
const FEE_TIER_APY: Record<number, number> = {
  100: 2,     // 0.01% — stable pairs
  500: 8,     // 0.05% — correlated pairs
  3000: 15,   // 0.3%  — standard pairs
  10000: 20,  // 1%    — exotic pairs
};

// Known MegaETH token prices (USD). Used to compute position value.
// USDM is the native MegaETH stablecoin.
const TOKEN_PRICES_USD: Record<string, number> = {
  '0xfafddbb3fc7688494971a79cc65dca3ef82079e7': 1.0,  // USDM
};

const megaEthClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

// ─── ABIs ────────────────────────────────────────────────────────────────────

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

// ─── Uniswap V3 Math ─────────────────────────────────────────────────────────

/**
 * Converts a tick to its corresponding sqrtPrice (float, not Q96).
 * sqrtPrice = sqrt(1.0001^tick)
 */
function sqrtPriceAtTick(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}

/**
 * Computes the raw token amounts from a Uniswap V3 position.
 * Amounts are in the smallest unit (wei-equivalent); divide by 10^decimals for display.
 *
 * Formula reference: Uniswap V3 whitepaper §6.2
 */
function getTokenAmountsFromLiquidity(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): { amount0: number; amount1: number } {
  // Convert sqrtPriceX96 from Q96 fixed-point to float
  // Precision loss is acceptable for display purposes
  const Q96 = Math.pow(2, 96);
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const sqrtA = sqrtPriceAtTick(tickLower);
  const sqrtB = sqrtPriceAtTick(tickUpper);
  const L = Number(liquidity);

  if (sqrtP <= sqrtA) {
    // Position is fully in token0 (below current price)
    return {
      amount0: L * (sqrtB - sqrtA) / (sqrtA * sqrtB),
      amount1: 0,
    };
  } else if (sqrtP >= sqrtB) {
    // Position is fully in token1 (above current price)
    return {
      amount0: 0,
      amount1: L * (sqrtB - sqrtA),
    };
  } else {
    // Position is active (price within range)
    return {
      amount0: L * (sqrtB - sqrtP) / (sqrtP * sqrtB),
      amount1: L * (sqrtP - sqrtA),
    };
  }
}

// ─── Main Reader ─────────────────────────────────────────────────────────────

/**
 * Reads all Prism LP positions (Uniswap V3 NFTs) for an address on MegaETH.
 * Shows token pair, fee tier, current liquidity, and uncollected fees as yield earned.
 */
export async function getPrismPositions(address: string): Promise<Position[]> {
  try {
    // Step 1: Check if user holds any LP NFTs
    const nftBalance = await megaEthClient.readContract({
      address: PRISM_POSITION_MANAGER,
      abi: POSITION_MANAGER_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (nftBalance === BigInt(0)) return [];

    const count = Number(nftBalance);

    // Step 2: Get all token IDs
    const tokenIdResults = await megaEthClient.multicall({
      contracts: Array.from({ length: count }, (_, i) => ({
        address: PRISM_POSITION_MANAGER as `0x${string}`,
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

    // Step 3: Get position data for all token IDs
    const positionResults = await megaEthClient.multicall({
      contracts: tokenIds.map((tokenId) => ({
        address: PRISM_POSITION_MANAGER as `0x${string}`,
        abi: POSITION_MANAGER_ABI,
        functionName: 'positions' as const,
        args: [tokenId],
      })),
      allowFailure: true,
    });

    // positions() returns a named tuple; viem multicall wraps it as an array
    type PosResult = readonly [
      bigint,           // nonce (uint96)
      `0x${string}`,   // operator
      `0x${string}`,   // token0
      `0x${string}`,   // token1
      number,           // fee (uint24)
      number,           // tickLower (int24)
      number,           // tickUpper (int24)
      bigint,           // liquidity (uint128)
      bigint,           // feeGrowthInside0LastX128
      bigint,           // feeGrowthInside1LastX128
      bigint,           // tokensOwed0 (uint128)
      bigint,           // tokensOwed1 (uint128)
    ];

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
      // Skip closed positions (liquidity = 0)
      .filter((p) => p.liquidity > BigInt(0));

    if (validPositions.length === 0) return [];

    // Step 4: Collect unique token addresses for metadata
    const uniqueTokens = new Set<string>();
    validPositions.forEach((p) => {
      uniqueTokens.add(p.token0.toLowerCase());
      uniqueTokens.add(p.token1.toLowerCase());
    });
    const tokenAddresses = [...uniqueTokens];

    // Step 5: Batch fetch token symbols and decimals
    const [symbolResults, decimalsResults] = await Promise.all([
      megaEthClient.multicall({
        contracts: tokenAddresses.map((addr) => ({
          address: addr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol' as const,
        })),
        allowFailure: true,
      }),
      megaEthClient.multicall({
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
        symbol:
          symbolResults[i].status === 'success'
            ? (symbolResults[i].result as string)
            : '???',
        decimals:
          decimalsResults[i].status === 'success'
            ? Number(decimalsResults[i].result as number)
            : 18,
      };
    });

    // Step 6: Get pool addresses from factory
    const poolAddressResults = await megaEthClient.multicall({
      contracts: validPositions.map((p) => ({
        address: PRISM_FACTORY as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'getPool' as const,
        args: [p.token0, p.token1, p.fee],
      })),
      allowFailure: true,
    });

    const poolAddresses = poolAddressResults.map((r) =>
      r.status === 'success' ? (r.result as `0x${string}`) : null,
    );

    // Step 7: Get current prices from pool slot0
    const slot0Results = await megaEthClient.multicall({
      contracts: poolAddresses.map((addr) => ({
        address: (addr ?? ZERO_ADDRESS) as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'slot0' as const,
      })),
      allowFailure: true,
    });

    type Slot0Result = readonly [
      bigint,  // sqrtPriceX96 (uint160)
      number,  // tick (int24)
      number,  // observationIndex
      number,  // observationCardinality
      number,  // observationCardinalityNext
      number,  // feeProtocol
      boolean, // unlocked
    ];

    // Step 8: Build Position objects
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

      const t0PriceUSD = TOKEN_PRICES_USD[t0Key] ?? 0;
      const t1PriceUSD = TOKEN_PRICES_USD[t1Key] ?? 0;

      // Calculate liquidity value in USD
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
        depositedUSD = amount0Human * t0PriceUSD + amount1Human * t1PriceUSD;
      }

      // Uncollected fees = real yield earned (from tokensOwed)
      const fees0Human = parseFloat(formatUnits(pos.tokensOwed0, t0Decimals));
      const fees1Human = parseFloat(formatUnits(pos.tokensOwed1, t1Decimals));
      const yieldEarned = fees0Human * t0PriceUSD + fees1Human * t1PriceUSD;

      const currentAPY = FEE_TIER_APY[pos.fee] ?? 10;
      const feePct = (pos.fee / 1_000_000) * 100;

      positions.push({
        protocol: 'Prism',
        protocolLogo: '/logos/prism.svg',
        asset: `${t0Symbol}/${t1Symbol} ${feePct.toFixed(2)}%`,
        assetAddress: poolAddr ?? pos.token0,
        depositedAmount: pos.liquidity,
        depositedUSD,
        currentAPY,
        yieldEarned,
        positionType: 'lp',
        entryTimestamp: estimatedEntryTimestamp,
      });
    }

    return positions;
  } catch (err) {
    console.error('[Prism] Failed to fetch positions:', err);
    return [];
  }
}
