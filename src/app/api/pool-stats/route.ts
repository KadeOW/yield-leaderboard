import { NextRequest, NextResponse } from 'next/server';

// Fresh pool stats for a single pool — 5-minute server cache
export const revalidate = 300;

const poolCache = new Map<string, { apy: number; tvlUSD: number; volume24hUSD: number; feePct: number; ts: number }>();
const CACHE_TTL = 5 * 60_000;

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

export interface PoolStatsResponse {
  address: string;
  apy: number;        // fee APY = (24h fees / TVL) × 365 × 100
  tvlUSD: number;
  volume24hUSD: number;
  feePct: number;     // e.g. 0.3 for 0.3%
  fetchedAt: number;  // unix ms
}

// GET /api/pool-stats?address=0x...
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get('address') ?? '').toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 });
  }

  const cached = poolCache.get(address);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ address, ...cached, fetchedAt: cached.ts } as PoolStatsResponse);
  }

  try {
    const res = await fetch(`${GECKO}/pools/${address}`, {
      headers: GECKO_HEADERS,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const empty: PoolStatsResponse = { address, apy: 0, tvlUSD: 0, volume24hUSD: 0, feePct: 0, fetchedAt: Date.now() };
      return NextResponse.json(empty);
    }

    const data: {
      data?: {
        attributes?: {
          name?: string;
          pool_fee_percentage?: string; // explicit fee field on single-pool endpoint
          reserve_in_usd?: string;
          volume_usd?: { h24?: string };
        };
        relationships?: {
          dex?: { data?: { id?: string } };
        };
      };
    } = await res.json();

    const attrs = data.data?.attributes ?? {};
    const dexId = data.data?.relationships?.dex?.data?.id ?? '';
    const isKumbaya = dexId.includes('kumbaya');

    const tvl = parseFloat(attrs.reserve_in_usd ?? '0');
    const volRaw = parseFloat(attrs.volume_usd?.h24 ?? '0');
    // Kumbaya reports two-sided volume (≈ 2× GeckoTerminal). Prism matches GeckoTerminal.
    const vol24h = isKumbaya ? volRaw * 2 : volRaw;

    // Prefer pool_fee_percentage (available on single-pool endpoint),
    // fall back to parsing from pool name e.g. "USDM / WETH 0.3%"
    let feePct = parseFloat(attrs.pool_fee_percentage ?? 'NaN');
    if (isNaN(feePct)) {
      const feeMatch = (attrs.name ?? '').match(/([\d.]+)%\s*$/);
      feePct = feeMatch ? parseFloat(feeMatch[1]) : 0;
    }
    const fees24h = vol24h * (feePct / 100);
    const apy = tvl > 500 ? (fees24h / tvl) * 365 * 100 : 0;

    const entry = { apy, tvlUSD: tvl, volume24hUSD: vol24h, feePct, ts: Date.now() };
    poolCache.set(address, entry);
    return NextResponse.json({ address, ...entry, fetchedAt: entry.ts } as PoolStatsResponse);
  } catch (err) {
    console.error('[pool-stats]', err);
    const empty: PoolStatsResponse = { address, apy: 0, tvlUSD: 0, volume24hUSD: 0, feePct: 0, fetchedAt: Date.now() };
    return NextResponse.json(empty);
  }
}
