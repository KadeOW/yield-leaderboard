// Aave V3 Sepolia deployment (chain ID 11155111)
// Verified via eth_getCode and direct RPC calls
export const AAVE_V3_SEPOLIA = {
  POOL: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951' as const,
  POOL_ADDRESSES_PROVIDER: '0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A' as const,
  POOL_DATA_PROVIDER: '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31' as const,
};

// Minimal ABI for AaveProtocolDataProvider
export const POOL_DATA_PROVIDER_ABI = [
  {
    name: 'getAllReservesTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'symbol', type: 'string' },
          { name: 'tokenAddress', type: 'address' },
        ],
      },
    ],
  },
  {
    name: 'getUserReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'currentATokenBalance', type: 'uint256' },
      { name: 'currentStableDebt', type: 'uint256' },
      { name: 'currentVariableDebt', type: 'uint256' },
      { name: 'principalStableDebt', type: 'uint256' },
      { name: 'scaledVariableDebt', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'stableRateLastUpdated', type: 'uint40' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
    ],
  },
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'unbacked', type: 'uint256' },
      { name: 'accruedToTreasuryScaled', type: 'uint256' },
      { name: 'totalAToken', type: 'uint256' },
      { name: 'totalStableDebt', type: 'uint256' },
      { name: 'totalVariableDebt', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'variableBorrowRate', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'averageStableBorrowRate', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint256' },
      { name: 'variableBorrowIndex', type: 'uint256' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
    ],
  },
  {
    name: 'getReserveTokensAddresses',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
    ],
  },
] as const;

// Token metadata for Aave V3 Sepolia reserves (verified addresses from getAllReservesTokens())
export const AAVE_SEPOLIA_TOKENS: Record<
  string,
  { symbol: string; decimals: number; priceUSD: number; logo: string }
> = {
  '0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357': {
    symbol: 'DAI',
    decimals: 18,
    priceUSD: 1.0,
    logo: '💵',
  },
  '0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5': {
    symbol: 'LINK',
    decimals: 18,
    priceUSD: 14.0,
    logo: '🔗',
  },
  '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8': {
    symbol: 'USDC',
    decimals: 6,
    priceUSD: 1.0,
    logo: '💵',
  },
  '0x29f2d40b0605204364af54ec677bd022da425d03': {
    symbol: 'WBTC',
    decimals: 8,
    priceUSD: 63000.0,
    logo: '₿',
  },
  '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c': {
    symbol: 'WETH',
    decimals: 18,
    priceUSD: 2900.0,
    logo: '⟠',
  },
  '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0': {
    symbol: 'USDT',
    decimals: 6,
    priceUSD: 1.0,
    logo: '💵',
  },
  '0x88541670e55cc00beefd87eb59edd1b7c511ac9a': {
    symbol: 'AAVE',
    decimals: 18,
    priceUSD: 100.0,
    logo: '👻',
  },
  '0x6d906e526a4e2ca02097ba9d0caa3c382f52278e': {
    symbol: 'EURS',
    decimals: 2,
    priceUSD: 1.08,
    logo: '💶',
  },
  '0xc4bf5cbdabe595361438f8c6a187bdc330539c60': {
    symbol: 'GHO',
    decimals: 18,
    priceUSD: 1.0,
    logo: '👻',
  },
};
