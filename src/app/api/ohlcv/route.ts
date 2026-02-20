import { NextResponse, NextRequest } from 'next/server';

export const revalidate = 300;

// Per-pool cache keyed by "pool:timeframe:limit"
const ohlcvCache = new Map<string, { data: OHLCVResponse; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface OHLCVCandle {
  timestamp: number; // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCVResponse {
  candles: OHLCVCandle[];
  poolAddress: string;
  fetchedAt: number;
}

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

// GET /api/ohlcv?pool=0x...&timeframe=hour&limit=48
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pool = (searchParams.get('pool') ?? '').toLowerCase();
  const timeframe = searchParams.get('timeframe') ?? 'hour';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '48', 10), 1000);

  if (!pool) {
    return NextResponse.json({ error: 'pool parameter required' }, { status: 400 });
  }

  const cacheKey = `${pool}:${timeframe}:${limit}`;
  const cached = ohlcvCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = `${GECKO}/pools/${pool}/ohlcv/${timeframe}?limit=${limit}&currency=usd`;
    const res = await fetch(url, {
      headers: GECKO_HEADERS,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const empty: OHLCVResponse = { candles: [], poolAddress: pool, fetchedAt: Date.now() };
      return NextResponse.json(empty);
    }

    const data: {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    } = await res.json();

    const candles: OHLCVCandle[] = (data.data?.attributes?.ohlcv_list ?? [])
      .map(([ts, open, high, low, close, volume]) => ({
        timestamp: ts * 1000,
        open,
        high,
        low,
        close,
        volume,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const payload: OHLCVResponse = { candles, poolAddress: pool, fetchedAt: Date.now() };
    ohlcvCache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/ohlcv]', err);
    return NextResponse.json({ candles: [], poolAddress: pool, fetchedAt: Date.now() });
  }
}
