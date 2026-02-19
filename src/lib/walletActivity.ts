import { createPublicClient, http, parseAbiItem } from 'viem';
import { megaEth } from '@/lib/chains';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

// NFT Transfer (Uniswap V3 position manager — tokenId is indexed)
const LP_TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);

// ERC-20 Transfer (vault shares — value is NOT indexed)
const VAULT_TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const POSITION_MANAGERS = [
  { address: '0xcb91c75a6b29700756d4411495be696c4e9a576e' as const, name: 'Prism' },
  { address: '0x2b781C57e6358f64864Ff8EC464a03Fdaf9974bA' as const, name: 'Kumbaya' },
];

const AVON_VAULT = '0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890' as const;

export interface ActivityEvent {
  type: 'lp_open' | 'lp_close' | 'vault_deposit' | 'vault_withdraw';
  protocol: string;
  tokenId?: bigint;
  blockNumber: bigint;
  timestamp: number;
}

const megaClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

/**
 * Scans on-chain event logs for a wallet's DeFi activity:
 * - LP position opens/closes on Prism and Kumbaya
 * - Avon vault deposits and withdrawals
 * Returns the 15 most recent events sorted newest-first.
 */
export async function getWalletActivity(address: string): Promise<ActivityEvent[]> {
  const raw: ActivityEvent[] = [];
  const addr = address as `0x${string}`;

  try {
    // LP opens and closes
    for (const pm of POSITION_MANAGERS) {
      const [opens, closes] = await Promise.all([
        megaClient.getLogs({
          address: pm.address,
          event: LP_TRANSFER,
          args: { from: ZERO, to: addr },
          fromBlock: 0n,
          toBlock: 'latest',
        }),
        megaClient.getLogs({
          address: pm.address,
          event: LP_TRANSFER,
          args: { from: addr, to: ZERO },
          fromBlock: 0n,
          toBlock: 'latest',
        }),
      ]);

      opens.forEach((log) => {
        if (log.blockNumber != null)
          raw.push({ type: 'lp_open', protocol: pm.name, tokenId: log.args.tokenId, blockNumber: log.blockNumber, timestamp: 0 });
      });
      closes.forEach((log) => {
        if (log.blockNumber != null)
          raw.push({ type: 'lp_close', protocol: pm.name, tokenId: log.args.tokenId, blockNumber: log.blockNumber, timestamp: 0 });
      });
    }

    // Avon vault share mints (deposit) and burns (withdraw)
    const [deposits, withdraws] = await Promise.all([
      megaClient.getLogs({ address: AVON_VAULT, event: VAULT_TRANSFER, args: { from: ZERO, to: addr }, fromBlock: 0n, toBlock: 'latest' }),
      megaClient.getLogs({ address: AVON_VAULT, event: VAULT_TRANSFER, args: { from: addr, to: ZERO }, fromBlock: 0n, toBlock: 'latest' }),
    ]);

    deposits.forEach((log) => {
      if (log.blockNumber != null)
        raw.push({ type: 'vault_deposit', protocol: 'Avon', blockNumber: log.blockNumber, timestamp: 0 });
    });
    withdraws.forEach((log) => {
      if (log.blockNumber != null)
        raw.push({ type: 'vault_withdraw', protocol: 'Avon', blockNumber: log.blockNumber, timestamp: 0 });
    });

    // Sort newest first, keep top 15
    raw.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    const top = raw.slice(0, 15);

    // Batch-fetch timestamps for unique block numbers
    const uniqueBlocks = [...new Set(top.map((e) => e.blockNumber))];
    const blocks = await Promise.all(uniqueBlocks.map((bn) => megaClient.getBlock({ blockNumber: bn })));
    const tsByBlock = new Map(uniqueBlocks.map((bn, i) => [bn.toString(), Number(blocks[i].timestamp)]));
    top.forEach((e) => { e.timestamp = tsByBlock.get(e.blockNumber.toString()) ?? 0; });

    return top;
  } catch (err) {
    console.error('[walletActivity]', err);
    return [];
  }
}
