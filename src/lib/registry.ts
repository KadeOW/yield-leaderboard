export type ProtocolTemplate = 'erc4626' | 'univ3';

export interface ProtocolConfig {
  id: string;
  name: string;
  logoEmoji: string;
  template: ProtocolTemplate;
  enabled: boolean;
  chain: 'megaeth' | 'sepolia';
  contracts: {
    vault?: string;
    positionManager?: string;
    factory?: string;
  };
  // ERC-4626 only
  underlyingToken?: {
    address: string;
    symbol: string;
    decimals: number;
    priceUSD: number;
  };
  apyEstimate: number;
  positionType: 'lending' | 'lp' | 'staking' | 'bond';
  addedAt: number;
}

const REGISTRY_KEY = 'yield_protocol_registry';

export function getRegistry(): ProtocolConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProtocolConfig[];
  } catch {
    return [];
  }
}

export function saveRegistry(protocols: ProtocolConfig[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(protocols));
}

export function addProtocol(config: Omit<ProtocolConfig, 'id' | 'addedAt'>): ProtocolConfig {
  const entry: ProtocolConfig = {
    ...config,
    id: crypto.randomUUID(),
    addedAt: Math.floor(Date.now() / 1000),
  };
  const registry = getRegistry();
  saveRegistry([...registry, entry]);
  return entry;
}

export function updateProtocol(id: string, updates: Partial<ProtocolConfig>): void {
  const registry = getRegistry();
  saveRegistry(registry.map((p) => (p.id === id ? { ...p, ...updates } : p)));
}

export function deleteProtocol(id: string): void {
  const registry = getRegistry();
  saveRegistry(registry.filter((p) => p.id !== id));
}
