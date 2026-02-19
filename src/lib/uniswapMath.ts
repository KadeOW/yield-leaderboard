/**
 * Shared Uniswap V3 math utilities.
 * Used by both the hardcoded prism.ts reader and the generic univ3 template.
 */

/**
 * Converts a tick to its corresponding sqrtPrice (float, not Q96).
 * sqrtPrice = sqrt(1.0001^tick)
 */
export function sqrtPriceAtTick(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}

/**
 * Computes the raw token amounts from a Uniswap V3 position.
 * Amounts are in the smallest unit (wei-equivalent); divide by 10^decimals for display.
 *
 * Formula reference: Uniswap V3 whitepaper §6.2
 */
export function getTokenAmountsFromLiquidity(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): { amount0: number; amount1: number } {
  const Q96 = Math.pow(2, 96);
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const sqrtA = sqrtPriceAtTick(tickLower);
  const sqrtB = sqrtPriceAtTick(tickUpper);
  const L = Number(liquidity);

  if (sqrtP <= sqrtA) {
    return {
      amount0: (L * (sqrtB - sqrtA)) / (sqrtA * sqrtB),
      amount1: 0,
    };
  } else if (sqrtP >= sqrtB) {
    return {
      amount0: 0,
      amount1: L * (sqrtB - sqrtA),
    };
  } else {
    return {
      amount0: (L * (sqrtB - sqrtP)) / (sqrtP * sqrtB),
      amount1: L * (sqrtP - sqrtA),
    };
  }
}
