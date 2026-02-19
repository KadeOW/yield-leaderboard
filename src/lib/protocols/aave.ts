import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import type { Position } from '@/types';
import {
  AAVE_V3_SEPOLIA,
  POOL_DATA_PROVIDER_ABI,
  AAVE_SEPOLIA_TOKENS,
} from '@/lib/contracts/aave';

// RAY = 1e27, used by Aave for interest rate math
const RAY = BigInt('1000000000000000000000000000');
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
// Assumed position age when we can't determine entry time (90 days)
const ASSUMED_POSITION_AGE_DAYS = 90;

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http('https://sepolia.drpc.org'),
});

/**
 * Reads a user's Aave V3 supply positions from Sepolia.
 * Uses Sepolia as a fallback since Aave V3 is not yet on MegaETH mainnet.
 */
export async function getAavePositions(address: string): Promise<Position[]> {
  try {
    // Step 1: Get all reserve tokens
    const reserves = await sepoliaClient.readContract({
      address: AAVE_V3_SEPOLIA.POOL_DATA_PROVIDER,
      abi: POOL_DATA_PROVIDER_ABI,
      functionName: 'getAllReservesTokens',
    });

    // Step 2: Multicall getUserReserveData for every reserve
    const userDataCalls = reserves.map(({ tokenAddress }) => ({
      address: AAVE_V3_SEPOLIA.POOL_DATA_PROVIDER as `0x${string}`,
      abi: POOL_DATA_PROVIDER_ABI,
      functionName: 'getUserReserveData' as const,
      args: [tokenAddress, address as `0x${string}`],
    }));

    const userDataResults = await sepoliaClient.multicall({
      contracts: userDataCalls,
      allowFailure: true,
    });

    const positions: Position[] = [];
    const now = Math.floor(Date.now() / 1000);
    const estimatedEntryTimestamp = now - ASSUMED_POSITION_AGE_DAYS * 86400;

    for (let i = 0; i < reserves.length; i++) {
      const result = userDataResults[i];
      if (result.status !== 'success') continue;

      // viem multicall returns a tuple: [currentATokenBalance, currentStableDebt, currentVariableDebt,
      // principalStableDebt, scaledVariableDebt, stableBorrowRate, liquidityRate, stableRateLastUpdated, usageAsCollateralEnabled]
      const raw = result.result as readonly [
        bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean
      ];
      const currentATokenBalance = raw[0];
      const currentStableDebt = raw[1];
      const currentVariableDebt = raw[2];
      const liquidityRate = raw[6];

      // Only include positions with an active supply balance
      if (currentATokenBalance === BigInt(0)) continue;

      const { tokenAddress, symbol } = reserves[i];
      const tokenKey = tokenAddress.toLowerCase();
      const tokenMeta = AAVE_SEPOLIA_TOKENS[tokenKey];

      if (!tokenMeta) continue;

      // Convert balance to human-readable
      const balanceFloat = parseFloat(
        formatUnits(currentATokenBalance, tokenMeta.decimals)
      );
      const depositedUSD = balanceFloat * tokenMeta.priceUSD;

      // APY: liquidityRate is in RAY (1e27). Convert to % per year.
      // Aave uses compounding: APY = (1 + liquidityRate/RAY/SECONDS_PER_YEAR)^SECONDS_PER_YEAR - 1
      // For simplicity, linear approximation: APY ≈ liquidityRate / RAY * 100
      const apyRaw = Number(liquidityRate) / Number(RAY);
      const currentAPY = apyRaw * 100;

      // Estimate yield earned over the assumed position age
      const yieldEarned =
        depositedUSD * apyRaw * (ASSUMED_POSITION_AGE_DAYS / 365);

      // Determine position type
      const hasDebt = currentVariableDebt > BigInt(0) || currentStableDebt > BigInt(0);
      const positionType = hasDebt ? ('lending' as const) : ('lending' as const);

      positions.push({
        protocol: 'Aave V3',
        protocolLogo: '/logos/aave.svg',
        asset: tokenMeta.symbol || symbol,
        assetAddress: tokenAddress,
        depositedAmount: currentATokenBalance,
        depositedUSD,
        currentAPY,
        yieldEarned,
        positionType,
        entryTimestamp: estimatedEntryTimestamp,
      });
    }

    return positions;
  } catch (err) {
    console.error('[Aave] Failed to fetch positions:', err);
    return [];
  }
}
