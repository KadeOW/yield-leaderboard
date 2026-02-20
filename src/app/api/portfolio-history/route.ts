import { NextRequest, NextResponse } from 'next/server';

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

// Stable coins on MegaETH — price treated as $1 USD
const STABLE_ADDRS = new Set([
  '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', // USDT0
  '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34', // USDe
  '0x88887be419578051ff9f4eb6c858a951921d8888', // STCUSD
]);
const WETH = '0x4200000000000000000000000000000000000006';

// Server-side cache for computed history (5 min)
const historyCache = new Map<string, { points: DayPoint[]; ts: number }>();
const CACHE_TTL = 5 * 60_000;

export interface DayPoint {
  date: string;
  value: number;
}

interface Holding {
  address: string; // lowercase token address, or 'native'
  balance: number;
  priceUSD: number; // current price — used as fallback
}

interface PoolRef {
  address: string;
  isBase: boolean;   // is our token the base token in this pool?
  otherAddr: string; // address of the other token
}

// Fetch the highest-TVL pools that include a given token
async function getTokenPools(tokenAddr: string): Promise<PoolRef[]> {
  try {
    const res = await fetch(
      `${GECKO}/tokens/${tokenAddr}/pools?sort=reserve_in_usd_descending&page=1`,
      { headers: GECKO_HEADERS, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data: {
      data?: {
        id: string;
        attributes?: { address?: string };
        relationships?: {
          base_token?: { data?: { id: string } };
          quote_token?: { data?: { id: string } };
        };
      }[];
    } = await res.json();

    return (data.data ?? []).map((pool) => {
      const baseAddr = (pool.relationships?.base_token?.data?.id ?? '').replace(/^megaeth_/, '').toLowerCase();
      const quoteAddr = (pool.relationships?.quote_token?.data?.id ?? '').replace(/^megaeth_/, '').toLowerCase();
      const poolAddr = pool.attributes?.address ?? pool.id.replace(/^megaeth_/, '');
      const isBase = baseAddr === tokenAddr;
      return { address: poolAddr, isBase, otherAddr: isBase ? quoteAddr : baseAddr };
    });
  } catch {
    return [];
  }
}

// Fetch 30-day daily OHLCV close prices, sorted oldest → newest
async function fetchCloses(poolAddr: string): Promise<number[]> {
  try {
    const res = await fetch(
      `${GECKO}/pools/${poolAddr}/ohlcv/day?limit=30`,
      { headers: GECKO_HEADERS, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data: { data?: { attributes?: { ohlcv_list?: number[][] } } } = await res.json();
    const list = data.data?.attributes?.ohlcv_list ?? [];
    list.sort((a, b) => a[0] - b[0]); // ascending timestamp
    return list.map((c) => c[4]);      // close price
  } catch {
    return [];
  }
}

// Pad or trim an array to exactly 30 entries (oldest first)
function pad30(prices: number[], fallback: number): number[] {
  if (prices.length === 0) return Array(30).fill(fallback);
  if (prices.length >= 30) return prices.slice(-30);
  return [...Array(30 - prices.length).fill(prices[0]), ...prices];
}

// WETH/USD price history — finds a WETH/stable pool and returns 30 daily USD prices
async function getWethHistory(fallback: number): Promise<number[]> {
  const pools = await getTokenPools(WETH);
  const stablePool = pools.find((p) => STABLE_ADDRS.has(p.otherAddr));
  if (!stablePool) return Array(30).fill(fallback);
  const closes = await fetchCloses(stablePool.address);
  if (closes.length === 0) return Array(30).fill(fallback);
  const prices = stablePool.isBase ? closes : closes.map((p) => (p > 0 ? 1 / p : fallback));
  return pad30(prices, fallback);
}

// Build 30-day USD price history for a single token
async function priceHistory(holding: Holding, wethFallback: number): Promise<number[]> {
  const addr = holding.address === 'native' ? WETH : holding.address.toLowerCase();
  const fb = holding.priceUSD;

  if (STABLE_ADDRS.has(addr)) return Array(30).fill(1);

  const pools = await getTokenPools(addr);
  if (pools.length === 0) return Array(30).fill(fb);

  // Prefer a direct stable pair → price already in USD
  const stablePool = pools.find((p) => STABLE_ADDRS.has(p.otherAddr));
  if (stablePool) {
    const closes = await fetchCloses(stablePool.address);
    if (closes.length > 0) {
      const prices = stablePool.isBase ? closes : closes.map((p) => (p > 0 ? 1 / p : fb));
      return pad30(prices, fb);
    }
  }

  // Fall back to a WETH pair → convert via WETH/USD history
  const wethPool = pools.find((p) => p.otherAddr === WETH);
  if (wethPool) {
    const [tokenCloses, wethUSD] = await Promise.all([
      fetchCloses(wethPool.address),
      getWethHistory(wethFallback),
    ]);
    if (tokenCloses.length > 0) {
      const inWeth = wethPool.isBase
        ? tokenCloses
        : tokenCloses.map((p) => (p > 0 ? 1 / p : 0));
      const padded = pad30(inWeth, 0);
      return padded.map((p, i) => p * (wethUSD[i] ?? wethFallback));
    }
  }

  return Array(30).fill(fb);
}

// GET /api/portfolio-history?h=<json-holdings>&pv=<positionsValue>
// holdings: [{address, balance, priceUSD}]
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('h');
  const positionsValue = parseFloat(req.nextUrl.searchParams.get('pv') ?? '0');

  if (!raw) return NextResponse.json({ points: [] });

  let holdings: Holding[];
  try {
    holdings = JSON.parse(raw);
  } catch {
    return NextResponse.json({ points: [] });
  }

  const cacheKey = raw + '|' + Math.round(positionsValue);
  const hit = historyCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ points: hit.points });
  }

  // Limit to top 8 holdings by current USD value to avoid hammering the API
  const top = [...holdings]
    .sort((a, b) => b.balance * b.priceUSD - a.balance * a.priceUSD)
    .slice(0, 8);

  const wethHolding = top.find((h) => h.address === 'native' || h.address === WETH);
  const wethFallback = wethHolding?.priceUSD ?? 2000;

  // Fetch all price histories in parallel (Next.js fetch cache deduplicates identical GECKO calls)
  const histories = await Promise.all(top.map((h) => priceHistory(h, wethFallback)));

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const points: DayPoint[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * DAY_MS);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let tokenValue = 0;
    top.forEach((h, hi) => {
      const p = histories[hi][i] ?? histories[hi].at(-1) ?? h.priceUSD;
      tokenValue += h.balance * p;
    });
    return { date: dateStr, value: Math.round(tokenValue + positionsValue) };
  });

  historyCache.set(cacheKey, { points, ts: Date.now() });
  return NextResponse.json({ points });
}
