import { NextResponse } from 'next/server';

// Revalidate every 3 hours (Next.js ISR-style caching for route handlers)
export const revalidate = 10800;

// Module-level cache so dev mode doesn't hammer GeckoTerminal on every hot-reload
// Initialized with ts=0 so the first request always fetches fresh data
let cachedResponse: { data: PoolDataResponse; ts: number } = {
  data: { prism: [], kumbaya: [], tokens: {}, fetchedAt: 0 },
  ts: 0,
};
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface PoolInfo {
  address: string;
  dex: 'Prism' | 'Kumbaya';
  name: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Logo?: string;
  token1Logo?: string;
  feePct: number;     // e.g. 0.3 means 0.3%
  tvlUSD: number;
  volume24hUSD: number;
  fees24hUSD: number;
  apy: number;        // fee APY = (fees24h / tvl) * 365 * 100
  priceChange24h: number;
  txCount24h: number;
  url: string;
}

export interface TokenInfo {
  address: string;   // lowercase
  symbol: string;
  decimals: number;
  logo?: string;
  priceUSD: number;  // from the highest-TVL pool that contains this token
}

export interface PoolDataResponse {
  prism: PoolInfo[];
  kumbaya: PoolInfo[];
  /** All unique tokens that appear in any Prism/Kumbaya pool, with live prices */
  tokens: Record<string, TokenInfo>; // keyed by lowercase address
  fetchedAt: number;
}

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

interface DexResult {
  pools: PoolInfo[];
  tokenInfoMap: Record<string, TokenInfo>;
}

async function fetchDexPools(
  dexSlug: string,
  dexName: 'Prism' | 'Kumbaya',
  dexUrl: string,
): Promise<DexResult> {
  const url = `${GECKO}/dexes/${dexSlug}/pools?page=1&include=base_token,quote_token`;

  const res = await fetch(url, {
    headers: GECKO_HEADERS,
    next: { revalidate: 10800 },
  });

  if (!res.ok) {
    console.warn(`[pools] GeckoTerminal ${dexSlug} returned ${res.status}`);
    return { pools: [], tokenInfoMap: {} };
  }

  const data: {
    data?: {
      id: string;
      attributes: {
        address?: string;
        name?: string;
        reserve_in_usd?: string;
        base_token_price_usd?: string;
        quote_token_price_usd?: string;
        volume_usd?: { h24?: string };
        price_change_percentage?: { h24?: string };
        transactions?: { h24?: { buys?: number; sells?: number } };
      };
      relationships?: {
        base_token?: { data?: { id: string } };
        quote_token?: { data?: { id: string } };
      };
    }[];
    included?: {
      id: string;
      type: string;
      attributes: {
        address?: string;
        symbol?: string;
        decimals?: number;
        image_url?: string;
      };
    }[];
  } = await res.json();

  // Build token metadata lookup (id → meta)
  const tokenMeta: Record<string, { address: string; symbol: string; decimals: number; logo?: string }> = {};
  for (const item of data.included ?? []) {
    if (item.type === 'token') {
      tokenMeta[item.id] = {
        address: (item.attributes.address ?? item.id.replace(/^megaeth_/, '')).toLowerCase(),
        symbol: item.attributes.symbol ?? '',
        decimals: item.attributes.decimals ?? 18,
        logo: item.attributes.image_url ?? undefined,
      };
    }
  }

  const pools: PoolInfo[] = [];
  // Track best price per token address (from the pool with highest TVL for that token)
  const tokenPrices: Record<string, { priceUSD: number; refTVL: number }> = {};

  for (const pool of data.data ?? []) {
    const a = pool.attributes;
    const tvl = parseFloat(a.reserve_in_usd ?? '0');
    const vol24h = parseFloat(a.volume_usd?.h24 ?? '0');
    // pool_fee_percentage isn't in the GeckoTerminal response — parse from name ("USDT0 / WETH 0.3%")
    const feeMatch = (a.name ?? '').match(/([\d.]+)%\s*$/);
    const feePct = feeMatch ? parseFloat(feeMatch[1]) : 0;
    const fees24h = vol24h * (feePct / 100);
    // Only compute APY when there's meaningful liquidity (avoid division by near-zero)
    const apy = tvl > 500 ? (fees24h / tvl) * 365 * 100 : 0;

    const baseId = pool.relationships?.base_token?.data?.id ?? '';
    const quoteId = pool.relationships?.quote_token?.data?.id ?? '';
    const t0 = tokenMeta[baseId] ?? { address: '', symbol: '', decimals: 18 };
    const t1 = tokenMeta[quoteId] ?? { address: '', symbol: '', decimals: 18 };

    // Track best price per token from the pool with highest TVL (most reliable reference)
    const basePrice = parseFloat(a.base_token_price_usd ?? '0');
    const quotePrice = parseFloat(a.quote_token_price_usd ?? '0');
    if (t0.address && basePrice > 0 && tvl > (tokenPrices[t0.address]?.refTVL ?? 0)) {
      tokenPrices[t0.address] = { priceUSD: basePrice, refTVL: tvl };
    }
    if (t1.address && quotePrice > 0 && tvl > (tokenPrices[t1.address]?.refTVL ?? 0)) {
      tokenPrices[t1.address] = { priceUSD: quotePrice, refTVL: tvl };
    }

    // Pool address: GeckoTerminal pool id is "megaeth_<address>"
    const address = a.address ?? pool.id.replace(/^megaeth_/, '');

    const nameParts = (a.name ?? '').split(' / ');
    pools.push({
      address,
      dex: dexName,
      name: a.name ?? '',
      token0Symbol: t0.symbol || nameParts[0] || '',
      token1Symbol: t1.symbol || nameParts[1]?.split(' ')[0] || '',
      token0Logo: t0.logo,
      token1Logo: t1.logo,
      feePct,
      tvlUSD: tvl,
      volume24hUSD: vol24h,
      fees24hUSD: fees24h,
      apy,
      priceChange24h: parseFloat(a.price_change_percentage?.h24 ?? '0'),
      txCount24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
      url: dexUrl,
    });
  }

  // Build final TokenInfo map for this DEX
  const tokenInfoMap: Record<string, TokenInfo> = {};
  for (const meta of Object.values(tokenMeta)) {
    if (!meta.address) continue;
    tokenInfoMap[meta.address] = {
      address: meta.address,
      symbol: meta.symbol,
      decimals: meta.decimals,
      logo: meta.logo,
      priceUSD: tokenPrices[meta.address]?.priceUSD ?? 0,
    };
  }

  return { pools, tokenInfoMap };
}

export async function GET() {
  // Serve from module cache if still fresh (ts=0 means not yet populated)
  if (cachedResponse.ts > 0 && Date.now() - cachedResponse.ts < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponse.data);
  }

  try {
    const [prismResult, kumbayaResult] = await Promise.all([
      fetchDexPools('prism-megaeth', 'Prism', 'https://prismfi.cc/'),
      fetchDexPools('kumbaya', 'Kumbaya', 'https://www.kumbaya.xyz/'),
    ]);

    // Merge token maps; for tokens in both DEXes, prefer Kumbaya (higher TVL → more reliable price)
    const tokens: Record<string, TokenInfo> = {
      ...prismResult.tokenInfoMap,
      ...kumbayaResult.tokenInfoMap,
    };

    const payload: PoolDataResponse = {
      prism: prismResult.pools,
      kumbaya: kumbayaResult.pools,
      tokens,
      fetchedAt: Date.now(),
    };
    cachedResponse = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/pools]', err);
    const stale = cachedResponse.ts > 0
      ? cachedResponse.data
      : { prism: [], kumbaya: [], tokens: {}, fetchedAt: Date.now() };
    return NextResponse.json(stale);
  }
}
