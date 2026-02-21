export type Currency = 'eth' | 'usd';

export function fmtETH(v: number): string {
  if (!v) return '—';
  if (v < 0.000001) return `${v.toFixed(8)} ETH`;
  if (v < 0.001) return `${v.toFixed(6)} ETH`;
  if (v < 1) return `${v.toFixed(4)} ETH`;
  return `${v.toFixed(3)} ETH`;
}

export function fmtNFTUSD(v: number): string {
  if (!v) return '—';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1000) return `$${v.toFixed(2)}`;
  if (v < 1_000_000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${(v / 1_000_000).toFixed(2)}M`;
}

export function fmtNFTPrice(ethVal: number, currency: Currency, ethPriceUSD: number): string {
  return currency === 'usd' ? fmtNFTUSD(ethVal * ethPriceUSD) : fmtETH(ethVal);
}
