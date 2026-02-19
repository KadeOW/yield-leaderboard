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
});

export const supportedChains = [megaEth, sepolia] as const;

export type SupportedChain = (typeof supportedChains)[number];
