import { defineChain } from 'viem';
import { sepolia } from 'wagmi/chains';

export const megaEth = defineChain({
  id: 4326,
  name: 'MegaETH',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://megaeth.drpc.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MegaETH Explorer',
      url: 'https://megaexplorer.xyz',
    },
  },
  contracts: {
    // Canonical Multicall3 — deployed at the same address on all EVM chains
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
});

export const supportedChains = [megaEth, sepolia] as const;

export type SupportedChain = (typeof supportedChains)[number];
