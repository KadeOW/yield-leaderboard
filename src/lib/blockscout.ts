/**
 * Blockscout API client for MegaETH
 * Base: https://megaeth.blockscout.com/api/v2/
 */

const BLOCKSCOUT_BASE = 'https://megaeth.blockscout.com/api/v2';

async function fetchBlockscout<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BLOCKSCOUT_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export interface BlockscoutTokenBalance {
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: string;
    type: string; // "ERC-20" | "ERC-721" | "ERC-1155"
    exchange_rate: string | null;
  };
  value: string; // raw balance as string (wei)
}

export interface BlockscoutNFT {
  id: string;           // token ID
  token_type: string;   // "ERC-721" | "ERC-1155"
  value: string;
  token: {
    address: string;
    name: string;
    symbol: string;
  };
  owner: string;
}

export interface BlockscoutNFTResponse {
  items: BlockscoutNFT[];
  next_page_params: unknown;
}

export interface BlockscoutTokenBalanceResponse {
  items?: BlockscoutTokenBalance[];
}

/**
 * Get all ERC-20 token balances for an address.
 * Used to detect Avon (USDmY) holdings without knowing in advance.
 */
export async function getTokenBalances(address: string): Promise<BlockscoutTokenBalance[]> {
  const data = await fetchBlockscout<BlockscoutTokenBalance[] | BlockscoutTokenBalanceResponse>(
    `/addresses/${address}/token-balances`
  );
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return (data as BlockscoutTokenBalanceResponse).items ?? [];
}

/**
 * Get all NFTs (ERC-721 / ERC-1155) owned by an address.
 * Used to detect Prism LP NFT positions.
 */
export async function getNFTsForAddress(
  address: string,
  contractAddress?: string
): Promise<BlockscoutNFT[]> {
  const query = contractAddress ? `?type=ERC-721&contract_address_hash=${contractAddress}` : '?type=ERC-721';
  const data = await fetchBlockscout<BlockscoutNFTResponse>(
    `/addresses/${address}/nft${query}`
  );
  return data?.items ?? [];
}
