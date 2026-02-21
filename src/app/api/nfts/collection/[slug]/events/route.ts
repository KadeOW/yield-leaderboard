import { NextResponse } from 'next/server';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const CACHE_TTL_MS = 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleEvent {
  ts: number;       // ms
  priceETH: number;
  tokenId: string;
  imgUrl?: string;
}

export interface ActivityBucket {
  date: string;     // "Jan 15"
  ts: number;       // day-start ms (for range filtering)
  listed: number;
  sold: number;
}

export interface CollectionEventsResponse {
  sales: SaleEvent[];
  activity: ActivityBucket[];   // 30 daily buckets, oldest first
  fetchedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const eventCache = new Map<string, { data: CollectionEventsResponse; ts: number }>();

function osHeaders(): Record<string, string> {
  const key = process.env.OPENSEA_API_KEY;
  return key ? { 'X-API-KEY': key } : {};
}

function parsePaymentETH(payment: Record<string, unknown>): number {
  try {
    const qty = String(payment.quantity ?? '0');
    const dec = Number(payment.decimals ?? 18);
    return Number(BigInt(qty)) / Math.pow(10, dec);
  } catch {
    return 0;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildDayBuckets(days: number): ActivityBucket[] {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const dayStart = Math.floor((now - (days - 1 - i) * DAY_MS) / DAY_MS) * DAY_MS;
    const d = new Date(dayStart);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ts: dayStart,
      listed: 0,
      sold: 0,
    };
  });
}

function bucketIndex(buckets: ActivityBucket[], tsMs: number): number {
  const dayTs = Math.floor(tsMs / DAY_MS) * DAY_MS;
  return buckets.findIndex((b) => b.ts === dayTs);
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchEvents(slug: string): Promise<CollectionEventsResponse> {
  const headers = osHeaders();
  // 30 days ago in Unix seconds
  const after = Math.floor((Date.now() - 30 * DAY_MS) / 1000);

  const [salesResult, listingsResult] = await Promise.allSettled([
    fetch(
      `${OPENSEA_BASE}/events/collection/${slug}?event_type=sale&limit=100&after=${after}`,
      { headers },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(
      `${OPENSEA_BASE}/events/collection/${slug}?event_type=listing&limit=100&after=${after}`,
      { headers },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const salesData = salesResult.status === 'fulfilled' ? salesResult.value : null;
  const listingsData = listingsResult.status === 'fulfilled' ? listingsResult.value : null;

  // Parse sale events
  const rawSales = ((salesData?.asset_events ?? []) as Record<string, unknown>[]);
  const sales: SaleEvent[] = rawSales
    .flatMap((e) => {
      // event_timestamp is Unix seconds
      const ts = Number(e.event_timestamp ?? 0) * 1000;
      if (!ts) return [];
      const payment = (e.payment ?? {}) as Record<string, unknown>;
      const priceETH = parsePaymentETH(payment);
      if (priceETH <= 0) return [];
      const nft = (e.nft ?? {}) as Record<string, unknown>;
      return [{
        ts,
        priceETH,
        tokenId: String(nft.identifier ?? ''),
        imgUrl: nft.display_image_url ? String(nft.display_image_url) : undefined,
      }];
    })
    .sort((a, b) => a.ts - b.ts);

  // Build 30-day activity buckets
  const buckets = buildDayBuckets(30);

  for (const s of sales) {
    const idx = bucketIndex(buckets, s.ts);
    if (idx >= 0) buckets[idx].sold++;
  }

  // Parse listing events (asset_events with event_type "order" / order_type "listing")
  const rawListings = ((listingsData?.asset_events ?? []) as Record<string, unknown>[]);
  for (const e of rawListings) {
    const ts = Number(e.event_timestamp ?? 0) * 1000;
    if (!ts) continue;
    const idx = bucketIndex(buckets, ts);
    if (idx >= 0) buckets[idx].listed++;
  }

  return { sales, activity: buckets, fetchedAt: Date.now() };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const { slug } = params;
  const cached = eventCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const data = await fetchEvents(slug);
    eventCache.set(slug, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[nfts/events/${slug}]`, e);
    const fallback = eventCache.get(slug);
    if (fallback) return NextResponse.json(fallback.data);
    return NextResponse.json({
      sales: [],
      activity: buildDayBuckets(30),
      fetchedAt: Date.now(),
    });
  }
}
