import { NextResponse } from 'next/server';

export const revalidate = 60;

let cache: { data: TradesResponse; ts: number } = {
  data: { trades: [], fetchedAt: 0 },
  ts: 0,
};
const CACHE_TTL_MS = 60 * 1000; // 1 min

export interface Trade {
  txHash: string;
  poolAddress: string;
  poolName: string;
  dex: string;
  kind: 'buy' | 'sell';
  /** Wallet that initiated the swap */
  makerAddress: string;
  fromToken: string;
  toToken: string;
  fromAmountUSD: number;
  toAmountUSD: number;
  /** USD value of the trade */
  volumeUSD: number;
  timestamp: number; // unix ms
}

export interface TradesResponse {
  trades: Trade[];
  fetchedAt: number;
}

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/megaeth';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

// Top pools by TVL to fetch trades from (Prism + Kumbaya top pools)
// We'll fetch pool list first, then pull trades from the top 5 by TVL
async function getTopPools(): Promise<{ address: string; name: string; dex: string }[]> {
  const res = await fetch(`${GECKO}/dexes/prism-megaeth/pools?page=1`, { headers: GECKO_HEADERS });
  const res2 = await fetch(`${GECKO}/dexes/kumbaya/pools?page=1`, { headers: GECKO_HEADERS });
  const pools: { address: string; name: string; dex: string; tvl: number }[] = [];
  for (const [r, dex] of [[res, 'Prism'], [res2, 'Kumbaya']] as const) {
    if (!r.ok) continue;
    const j: {
      data?: { id: string; attributes: { address?: string; name?: string; reserve_in_usd?: string } }[];
    } = await r.json();
    for (const p of j.data ?? []) {
      pools.push({
        address: p.attributes.address ?? p.id.replace(/^megaeth_/, ''),
        name: p.attributes.name ?? '',
        dex,
        tvl: parseFloat(p.attributes.reserve_in_usd ?? '0'),
      });
    }
  }
  return pools
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 5)
    .map(({ address, name, dex }) => ({ address, name, dex }));
}

async function fetchTradesForPool(pool: { address: string; name: string; dex: string }): Promise<Trade[]> {
  const res = await fetch(`${GECKO}/pools/${pool.address}/trades`, { headers: GECKO_HEADERS });
  if (!res.ok) return [];
  const data: {
    data?: {
      id: string;
      attributes: {
        block_timestamp?: string;
        kind?: string;
        volume_in_usd?: string;
        from_token_amount?: string;
        to_token_amount?: string;
        tx_hash?: string;
        tx_from_address?: string;
        from_token_address?: string;
        to_token_address?: string;
      };
    }[];
  } = await res.json();

  return (data.data ?? []).map((t) => {
    const a = t.attributes;
    const volUSD = parseFloat(a.volume_in_usd ?? '0');
    return {
      txHash: a.tx_hash ?? t.id,
      poolAddress: pool.address,
      poolName: pool.name,
      dex: pool.dex,
      kind: (a.kind === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      makerAddress: a.tx_from_address ?? '',
      fromToken: a.from_token_address ?? '',
      toToken: a.to_token_address ?? '',
      fromAmountUSD: volUSD,
      toAmountUSD: volUSD,
      volumeUSD: volUSD,
      timestamp: a.block_timestamp ? new Date(a.block_timestamp).getTime() : Date.now(),
    };
  });
}

export async function GET() {
  if (cache.ts > 0 && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const topPools = await getTopPools();
    const allTrades = await Promise.all(topPools.map(fetchTradesForPool));
    const trades = allTrades
      .flat()
      .filter((t) => t.volumeUSD >= 100) // only trades ≥ $100
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);

    const payload: TradesResponse = { trades, fetchedAt: Date.now() };
    cache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/trades]', err);
    const stale = cache.ts > 0 ? cache.data : { trades: [], fetchedAt: Date.now() };
    return NextResponse.json(stale);
  }
}
