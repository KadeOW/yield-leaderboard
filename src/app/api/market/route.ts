import { NextResponse } from 'next/server';

export const revalidate = 300;

let cache: { data: MarketDataResponse; ts: number } = {
  data: { trending: [], newPools: [], newTokens: [], fetchedAt: 0 },
  ts: 0,
};
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface MarketPool {
  address: string;
  name: string;
  dex: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Logo?: string;
  token1Logo?: string;
  tvlUSD: number;
  volume24hUSD: number;
  priceChange24h: number;
  apy: number;
  txCount24h: number;
  createdAt?: number;
}

export interface NewTokenInfo {
  address: string;    // lowercase token contract address
  symbol: string;
  logo?: string;
  priceUSD: number;
  priceChange24h: number;
  volume24hUSD: number;
  topPoolAddress: string;
  topPoolDex: string;
  createdAt?: number; // when the pool (and likely the token) first appeared
}

export interface MarketDataResponse {
  trending: MarketPool[];
  newPools: MarketPool[];
  newTokens: NewTokenInfo[];
  fetchedAt: number;
}

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

type RawPoolItem = {
  id: string;
  attributes: {
    address?: string;
    name?: string;
    reserve_in_usd?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
    transactions?: { h24?: { buys?: number; sells?: number } };
    pool_created_at?: string;
    base_token_price_usd?: string;
    quote_token_price_usd?: string;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    quote_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
};

type RawTokenItem = {
  id: string;
  type: string;
  attributes: {
    address?: string;
    symbol?: string;
    image_url?: string;
  };
};

type GeckoRes = { data?: RawPoolItem[]; included?: RawTokenItem[] } | null;

function parseDex(dexId: string): string {
  if (dexId.includes('kumbaya')) return 'Kumbaya';
  if (dexId.includes('prism'))   return 'Prism';
  return dexId;
}

function buildTokenMeta(included: RawTokenItem[]): Record<string, { address: string; symbol: string; logo?: string }> {
  const meta: Record<string, { address: string; symbol: string; logo?: string }> = {};
  for (const item of included) {
    if (item.type === 'token') {
      meta[item.id] = {
        address: (item.attributes.address ?? item.id.replace(/^megaeth_/, '')).toLowerCase(),
        symbol: item.attributes.symbol ?? '',
        logo: item.attributes.image_url ?? undefined,
      };
    }
  }
  return meta;
}

function extractPools(res: GeckoRes): MarketPool[] {
  if (!res?.data) return [];
  const tokenMeta = buildTokenMeta(res.included ?? []);
  return res.data.map((pool) => {
    const a = pool.attributes;
    const tvl = parseFloat(a.reserve_in_usd ?? '0');
    const vol24h = parseFloat(a.volume_usd?.h24 ?? '0');
    const feeMatch = (a.name ?? '').match(/([\d.]+)%\s*$/);
    const feePct = feeMatch ? parseFloat(feeMatch[1]) : 0;
    const fees24h = vol24h * (feePct / 100);
    const apy = tvl > 500 ? (fees24h / tvl) * 365 * 100 : 0;
    const address = a.address ?? pool.id.replace(/^megaeth_/, '');
    const dex = parseDex(pool.relationships?.dex?.data?.id ?? '');
    const baseId = pool.relationships?.base_token?.data?.id ?? '';
    const quoteId = pool.relationships?.quote_token?.data?.id ?? '';
    const t0 = tokenMeta[baseId];
    const t1 = tokenMeta[quoteId];
    const nameParts = (a.name ?? '').split(' / ');
    return {
      address,
      name: a.name ?? '',
      dex,
      token0Symbol: t0?.symbol || nameParts[0] || '',
      token1Symbol: t1?.symbol || nameParts[1]?.split(' ')[0] || '',
      token0Logo: t0?.logo,
      token1Logo: t1?.logo,
      tvlUSD: tvl,
      volume24hUSD: vol24h,
      priceChange24h: parseFloat(a.price_change_percentage?.h24 ?? '0'),
      apy,
      txCount24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
      createdAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : undefined,
    };
  });
}

/**
 * Extract individual new tokens from the new_pools response.
 * Both sides of each pair are extracted; deduped by address.
 * The token entry keeps the data from its newest/highest-volume pool.
 */
function extractNewTokens(res: GeckoRes): NewTokenInfo[] {
  if (!res?.data) return [];
  const tokenMeta = buildTokenMeta(res.included ?? []);
  // address → token info (we'll keep the entry from the newest pool)
  const tokenMap = new Map<string, NewTokenInfo & { _vol: number; _createdAt: number }>();

  for (const pool of res.data) {
    const a = pool.attributes;
    const vol24h = parseFloat(a.volume_usd?.h24 ?? '0');
    const priceChange = parseFloat(a.price_change_percentage?.h24 ?? '0');
    const poolAddr = a.address ?? pool.id.replace(/^megaeth_/, '');
    const dex = parseDex(pool.relationships?.dex?.data?.id ?? '');
    const createdAt = a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0;
    const baseId = pool.relationships?.base_token?.data?.id ?? '';
    const quoteId = pool.relationships?.quote_token?.data?.id ?? '';
    const basePrice = parseFloat(a.base_token_price_usd ?? '0');
    const quotePrice = parseFloat(a.quote_token_price_usd ?? '0');

    for (const [tokenId, price] of [
      [baseId, basePrice],
      [quoteId, quotePrice],
    ] as [string, number][]) {
      const meta = tokenMeta[tokenId];
      if (!meta?.address || !meta.symbol) continue;
      const addr = meta.address;

      const existing = tokenMap.get(addr);
      // Keep data from the newest pool (createdAt desc), tie-break by volume
      if (!existing || createdAt > existing._createdAt || (createdAt === existing._createdAt && vol24h > existing._vol)) {
        tokenMap.set(addr, {
          address: addr,
          symbol: meta.symbol,
          logo: meta.logo,
          priceUSD: price,
          priceChange24h: priceChange,
          volume24hUSD: vol24h,
          topPoolAddress: poolAddr,
          topPoolDex: dex,
          createdAt: createdAt || undefined,
          _vol: vol24h,
          _createdAt: createdAt,
        });
      }
    }
  }

  return [...tokenMap.values()]
    .map(({ _vol: _, _createdAt: __, ...t }) => t)
    .filter((t) => t.symbol.length > 0)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

async function fetchGecko(path: string): Promise<GeckoRes> {
  const res = await fetch(`${GECKO}${path}`, { headers: GECKO_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) return null;
  return res.json();
}

export async function GET() {
  if (cache.ts > 0 && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const [trendingRes, newRes] = await Promise.all([
      fetchGecko('/trending_pools?include=base_token,quote_token,dex'),
      fetchGecko('/new_pools?include=base_token,quote_token,dex'),
    ]);

    const trending = extractPools(trendingRes);
    const newPools = extractPools(newRes);
    const newTokens = extractNewTokens(newRes);

    const payload: MarketDataResponse = { trending, newPools, newTokens, fetchedAt: Date.now() };
    cache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/market]', err);
    const stale = cache.ts > 0 ? cache.data : { trending: [], newPools: [], newTokens: [], fetchedAt: Date.now() };
    return NextResponse.json(stale);
  }
}
