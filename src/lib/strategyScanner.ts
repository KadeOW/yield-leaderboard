import { createPublicClient, http, parseAbiItem } from 'viem';
import { megaEth } from '@/lib/chains';
import { getAllPositions } from '@/lib/protocols';
import { detectStrategy, type DetectedStrategy } from '@/lib/strategyDetector';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

// ERC-20 share mint (Avon vault)
const VAULT_TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// NFT mint (Prism / Kumbaya position managers)
const NFT_TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);

const AVON_VAULT     = '0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890' as const;
const PRISM_PM       = '0xcb91c75a6b29700756d4411495be696c4e9a576e' as const;
const KUMBAYA_PM     = '0x2b781C57e6358f64864Ff8EC464a03Fdaf9974bA' as const;

const BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const megaClient = createPublicClient({
  chain: megaEth,
  transport: http('https://megaeth.drpc.org'),
});

export interface DiscoveredWalletStrategy {
  address: string;
  strategy: DetectedStrategy;
}

/**
 * Scans on-chain to find wallets running looping strategies:
 * 1. Collects all Avon depositors (ERC-20 share mints)
 * 2. Batch-checks which of those wallets also hold Prism or Kumbaya LP NFTs
 * 3. Fetches full positions for those wallets and runs strategy detection
 *
 * Returns up to `limit` discovered strategies, sorted by totalAPY desc.
 */
export async function scanForLoopStrategists(limit = 8): Promise<DiscoveredWalletStrategy[]> {
  try {
    // Step 1: find all Avon depositors
    const avonMints = await megaClient.getLogs({
      address: AVON_VAULT,
      event: VAULT_TRANSFER,
      args: { from: ZERO },
      fromBlock: 0n,
      toBlock: 'latest',
    });

    const depositors = [...new Set(
      avonMints
        .map((l) => (l.args.to as string | undefined)?.toLowerCase())
        .filter((a): a is string => !!a && a !== ZERO.toLowerCase()),
    )];

    if (depositors.length === 0) return [];

    // Step 2: batch-check LP balances via multicall
    const prismChecks = depositors.map((addr) => ({
      address: PRISM_PM,
      abi: BALANCE_ABI,
      functionName: 'balanceOf' as const,
      args: [addr as `0x${string}`],
    }));
    const kumbayaChecks = depositors.map((addr) => ({
      address: KUMBAYA_PM,
      abi: BALANCE_ABI,
      functionName: 'balanceOf' as const,
      args: [addr as `0x${string}`],
    }));

    const [prismResults, kumbayaResults] = await Promise.all([
      megaClient.multicall({ contracts: prismChecks, allowFailure: true }),
      megaClient.multicall({ contracts: kumbayaChecks, allowFailure: true }),
    ]);

    // Step 3: filter to wallets with both Avon deposit + at least one LP
    const loopWallets = depositors.filter((_, i) => {
      const hasPrism   = prismResults[i]?.status === 'success'   && (prismResults[i].result as bigint) > 0n;
      const hasKumbaya = kumbayaResults[i]?.status === 'success' && (kumbayaResults[i].result as bigint) > 0n;
      return hasPrism || hasKumbaya;
    });

    if (loopWallets.length === 0) return [];

    // Step 4: fetch positions + detect strategy for each looping wallet
    const results = await Promise.all(
      loopWallets.slice(0, limit * 2).map(async (addr) => {
        try {
          const positions = await getAllPositions(addr);
          const strategy  = detectStrategy(positions);
          if (!strategy || !strategy.isLoop) return null;
          return { address: addr, strategy } as DiscoveredWalletStrategy;
        } catch {
          return null;
        }
      }),
    );

    return results
      .filter((r): r is DiscoveredWalletStrategy => r !== null)
      .sort((a, b) => b.strategy.totalAPY - a.strategy.totalAPY)
      .slice(0, limit);
  } catch (err) {
    console.error('[strategyScanner]', err);
    return [];
  }
}
