/**
 * Price utilities for computing LP position USD values.
 * ETH price is fetched from DeFiLlama's free API and cached for 1 minute.
 */

let ethCache: { price: number; ts: number } | null = null;

export async function getEthPriceUSD(): Promise<number> {
  if (ethCache && Date.now() - ethCache.ts < 60_000) return ethCache.price;
  try {
    const res = await fetch('https://coins.llama.fi/prices/current/coingecko:ethereum', {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json() as { coins?: { 'coingecko:ethereum'?: { price?: number } } };
      const price = data?.coins?.['coingecko:ethereum']?.price;
      if (price && price > 0) {
        ethCache = { price, ts: Date.now() };
        return price;
      }
    }
  } catch {}
  return ethCache?.price ?? 2500;
}

/**
 * Canonical wrapped-ETH addresses across EVM chains (lowercase).
 * Used to identify the ETH-priced leg of an LP pair.
 */
const WETH_ADDRESSES = new Set([
  '0x4200000000000000000000000000000000000006', // OP Stack WETH (MegaETH, Base, Optimism)
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // Ethereum mainnet WETH
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // Arbitrum WETH
]);

export function isWETH(address: string): boolean {
  return WETH_ADDRESSES.has(address.toLowerCase());
}

/**
 * Derives USD prices for both tokens in a Uniswap V3 pool given the pool's
 * sqrtPriceX96 and a known USD price for one of the tokens.
 *
 * Uniswap V3 encoding: sqrtPriceX96 = sqrt(token1_raw / token0_raw) * 2^96
 * where "raw" means in wei-sized (undivided by decimals) units.
 *
 * @param knownToken - 'token0' if we know token0's USD price, 'token1' otherwise
 */
export function derivePricesFromSqrtPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
  knownToken: 'token0' | 'token1',
  knownPriceUSD: number,
): { token0PriceUSD: number; token1PriceUSD: number } {
  const Q96 = 2 ** 96;
  const sqrtP = Number(sqrtPriceX96) / Q96;
  if (sqrtP === 0) return { token0PriceUSD: 0, token1PriceUSD: 0 };

  // priceRaw = token1_raw per token0_raw
  const priceRaw = sqrtP * sqrtP;
  // Human-readable: 1 token0 = price0in1 token1
  const price0in1 = priceRaw * 10 ** (decimals0 - decimals1);

  if (knownToken === 'token1') {
    return {
      token0PriceUSD: price0in1 * knownPriceUSD,
      token1PriceUSD: knownPriceUSD,
    };
  } else {
    const price1in0 = price0in1 > 0 ? 1 / price0in1 : 0;
    return {
      token0PriceUSD: knownPriceUSD,
      token1PriceUSD: price1in0 * knownPriceUSD,
    };
  }
}
