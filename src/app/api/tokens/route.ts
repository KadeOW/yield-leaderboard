import { NextResponse } from 'next/server';
import { createPublicClient, http, formatUnits } from 'viem';
import { megaEth } from '@/lib/chains';

const megaClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

const TOTAL_SUPPLY_ABI = [
  {
    name: 'totalSupply',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const revalidate = 300;

let cache: { data: TokenStatsResponse; ts: number } = {
  data: { tokens: [], fetchedAt: 0 },
  ts: 0,
};
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface TokenStat {
  address: string;     // lowercase
  symbol: string;
  logo?: string;
  priceUSD: number;
  priceChange24h: number;
  volume24hUSD: number;
  fdvUSD?: number;
  buys24h: number;
  sells24h: number;
  topPoolAddress: string;
  topPoolName: string;
  topPoolDex: string;
}

export interface TokenStatsResponse {
  tokens: TokenStat[];
  fetchedAt: number;
}

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

type RawPool = {
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
    dex?: { data?: { id: string } };
  };
};

type RawIncluded = {
  id: string;
  type: string;
  attributes: { address?: string; symbol?: string; image_url?: string; decimals?: number };
};

async function fetchDexPools(dexSlug: string): Promise<{ data: RawPool[]; included: RawIncluded[] }> {
  const res = await fetch(
    `${GECKO}/dexes/${dexSlug}/pools?page=1&include=base_token,quote_token`,
    { headers: GECKO_HEADERS, next: { revalidate: 300 } },
  );
  if (!res.ok) return { data: [], included: [] };
  const json = await res.json();
  return { data: json.data ?? [], included: json.included ?? [] };
}

type TokenAgg = {
  address: string;
  symbol: string;
  logo?: string;
  decimals: number;
  priceUSD: number;
  priceChange24h: number;
  volume24hUSD: number;
  buys24h: number;
  sells24h: number;
  topPoolAddress: string;
  topPoolName: string;
  topPoolDex: string;
  _refTVL: number;
};

export async function GET() {
  if (cache.ts > 0 && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const [prism, kumbaya] = await Promise.all([
      fetchDexPools('prism-megaeth'),
      fetchDexPools('kumbaya'),
    ]);

    // Build token metadata from included items
    const tokenMeta: Record<string, { address: string; symbol: string; logo?: string; decimals: number }> = {};
    for (const item of [...prism.included, ...kumbaya.included]) {
      if (item.type === 'token') {
        tokenMeta[item.id] = {
          address: (item.attributes.address ?? item.id.replace(/^megaeth_/, '')).toLowerCase(),
          symbol: item.attributes.symbol ?? '',
          logo: item.attributes.image_url ?? undefined,
          decimals: item.attributes.decimals ?? 18,
        };
      }
    }

    const tokenMap = new Map<string, TokenAgg>();

    function processPool(pool: RawPool, dexLabel: string) {
      const a = pool.attributes;
      const tvl = parseFloat(a.reserve_in_usd ?? '0');
      const vol24h = parseFloat(a.volume_usd?.h24 ?? '0');
      const priceChange = parseFloat(a.price_change_percentage?.h24 ?? '0');
      const buys = a.transactions?.h24?.buys ?? 0;
      const sells = a.transactions?.h24?.sells ?? 0;
      const poolAddr = a.address ?? pool.id.replace(/^megaeth_/, '');
      const poolName = a.name ?? '';
      const baseId = pool.relationships?.base_token?.data?.id ?? '';
      const quoteId = pool.relationships?.quote_token?.data?.id ?? '';
      const basePrice = parseFloat(a.base_token_price_usd ?? '0');
      const quotePrice = parseFloat(a.quote_token_price_usd ?? '0');

      for (const [tokenId, tokenPrice] of [
        [baseId, basePrice],
        [quoteId, quotePrice],
      ] as [string, number][]) {
        const meta = tokenMeta[tokenId];
        if (!meta?.address) continue;
        const addr = meta.address;
        const existing = tokenMap.get(addr);
        if (!existing) {
          tokenMap.set(addr, {
            address: addr,
            symbol: meta.symbol,
            logo: meta.logo,
            decimals: meta.decimals,
            priceUSD: tokenPrice,
            priceChange24h: priceChange,
            volume24hUSD: vol24h,
            buys24h: buys,
            sells24h: sells,
            topPoolAddress: poolAddr,
            topPoolName: poolName,
            topPoolDex: dexLabel,
            _refTVL: tvl,
          });
        } else {
          existing.volume24hUSD += vol24h;
          existing.buys24h += buys;
          existing.sells24h += sells;
          if (tvl > existing._refTVL) {
            existing.priceUSD = tokenPrice;
            existing.priceChange24h = priceChange;
            existing.topPoolAddress = poolAddr;
            existing.topPoolName = poolName;
            existing.topPoolDex = dexLabel;
            existing._refTVL = tvl;
          }
        }
      }
    }

    for (const pool of prism.data) processPool(pool, 'Prism');
    for (const pool of kumbaya.data) processPool(pool, 'Kumbaya');

    const tokenEntries = [...tokenMap.values()].filter((t) => t.volume24hUSD > 0 || t.priceUSD > 0);
    const addresses = tokenEntries.map((t) => t.address).filter(Boolean).slice(0, 30);

    // Step 1: fetch GeckoTerminal's cross-DEX token data in one batched call.
    // This gives us their aggregated price_usd (includes SectorOne and any other DEX)
    // and fdv_usd when they have total-supply data.
    // Next.js data cache (next: { revalidate: 300 }) means this only hits GeckoTerminal
    // once per 5 minutes — well within free-tier rate limits alongside the pool fetches.
    const geckoPrice: Record<string, number> = {};   // address → GeckoTerminal price_usd
    const geckoFdv: Record<string, number> = {};     // address → GeckoTerminal fdv_usd
    if (addresses.length > 0) {
      try {
        const multiRes = await fetch(
          `${GECKO}/tokens/multi/${addresses.join(',')}`,
          { headers: GECKO_HEADERS, next: { revalidate: 300 } },
        );
        if (multiRes.ok) {
          const multiData: {
            data?: { attributes: { address?: string; price_usd?: string; fdv_usd?: string; market_cap_usd?: string } }[];
          } = await multiRes.json();
          for (const item of multiData.data ?? []) {
            const addr = item.attributes.address?.toLowerCase();
            if (!addr) continue;
            const p = parseFloat(item.attributes.price_usd ?? '0');
            const f = parseFloat(item.attributes.fdv_usd ?? item.attributes.market_cap_usd ?? '0');
            if (p > 0) geckoPrice[addr] = p;
            if (f > 0) geckoFdv[addr] = f;
          }
        }
      } catch {
        // Continue without GeckoTerminal token data
      }
    }

    // Step 2: fetch on-chain totalSupply() for tokens where GeckoTerminal has no fdv_usd.
    // Combined with GeckoTerminal's cross-DEX price_usd this gives the most accurate FDV.
    const needsSupply = tokenEntries.filter((t) => !geckoFdv[t.address]);
    const fdvMap: Record<string, number> = { ...geckoFdv };
    if (needsSupply.length > 0) {
      try {
        const supplyResults = await megaClient.multicall({
          contracts: needsSupply.map((t) => ({
            address: t.address as `0x${string}`,
            abi: TOTAL_SUPPLY_ABI,
            functionName: 'totalSupply' as const,
          })),
          allowFailure: true,
        });
        supplyResults.forEach((result, i) => {
          if (result.status !== 'success') return;
          const t = needsSupply[i];
          const supply = Number(formatUnits(result.result as bigint, t.decimals));
          // Prefer GeckoTerminal's cross-DEX price; fall back to pool price
          const price = geckoPrice[t.address] ?? t.priceUSD;
          const fdv = supply * price;
          if (fdv > 0 && fdv < 1e15) fdvMap[t.address] = fdv; // sanity cap
        });
      } catch {
        // FDV optional — continue without it
      }
    }

    const tokens: TokenStat[] = tokenEntries
      .map(({ _refTVL: _, decimals: __, ...t }) => ({ ...t, fdvUSD: fdvMap[t.address] }))
      .sort((a, b) => b.volume24hUSD - a.volume24hUSD);

    const payload: TokenStatsResponse = { tokens, fetchedAt: Date.now() };
    cache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/tokens]', err);
    const stale = cache.ts > 0 ? cache.data : { tokens: [], fetchedAt: Date.now() };
    return NextResponse.json(stale);
  }
}
