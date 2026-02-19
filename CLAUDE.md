# Yield Leaderboard — Project Specification

## Overview
A read-only DeFi dashboard and social leaderboard for MegaETH. Users connect their wallet to see their yield-earning positions across protocols, get ranked on a public leaderboard, and browse top earners' strategies.

## IMPORTANT: Security Rules
- This app NEVER handles private keys, seed phrases, or wallet signing for transactions
- This app NEVER sends transactions — it is 100% READ-ONLY
- All blockchain interactions are read-only calls (eth_call, getLogs, etc.)
- Wallet connection is ONLY used to identify the user's address for reading their positions
- All API keys go in .env.local, NEVER committed to git
- Use environment variables for all sensitive configuration
- Validate and sanitize all user inputs
- Use Content Security Policy headers in next.config.js
- No localStorage for sensitive data

## Tech Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Wallet Connection:** RainbowKit + wagmi v2
- **Blockchain Reads:** viem
- **State Management:** React hooks + React Query (TanStack Query)
- **Charts:** Recharts
- **Deployment:** Vercel

## Chain Configuration
- **Primary:** MegaETH Mainnet (Chain ID: 6342, RPC: https://rpc.megaeth.com)
- **Fallback for development:** Ethereum Sepolia testnet
- If MegaETH contracts are not available, use Aave V3 on Sepolia as a mock data source

## Folder Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Landing page
│   ├── dashboard/
│   │   └── page.tsx        # User's portfolio dashboard
│   ├── leaderboard/
│   │   └── page.tsx        # Public leaderboard
│   └── profile/
│       └── [address]/
│           └── page.tsx    # Public profile view
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── wallet/
│   │   └── ConnectButton.tsx
│   ├── dashboard/
│   │   ├── PositionCard.tsx
│   │   ├── YieldSummary.tsx
│   │   └── YieldChart.tsx
│   ├── leaderboard/
│   │   ├── LeaderboardTable.tsx
│   │   └── LeaderboardRow.tsx
│   └── profile/
│       ├── StrategyMap.tsx
│       └── PositionHistory.tsx
├── hooks/
│   ├── usePositions.ts     # Fetch user DeFi positions
│   ├── useYieldData.ts     # Calculate yield metrics
│   └── useLeaderboard.ts   # Fetch leaderboard data
├── lib/
│   ├── contracts/          # ABI files and contract addresses
│   ├── protocols/          # Protocol-specific position readers
│   │   ├── aave.ts
│   │   ├── morpho.ts
│   │   └── index.ts        # Aggregator
│   ├── scoring.ts          # Yield score calculation
│   ├── chains.ts           # Chain configuration
│   └── utils.ts            # Formatting, math helpers
├── types/
│   └── index.ts            # TypeScript interfaces
└── styles/
    └── globals.css         # Tailwind imports + custom styles
```

## TypeScript Interfaces

```typescript
interface Position {
  protocol: string;
  protocolLogo: string;
  asset: string;
  assetAddress: string;
  depositedAmount: bigint;
  depositedUSD: number;
  currentAPY: number;
  yieldEarned: number;
  positionType: "lending" | "staking" | "lp" | "bond";
  entryTimestamp: number;
}

interface UserProfile {
  address: string;
  ensName?: string;
  positions: Position[];
  totalDeposited: number;
  totalYieldEarned: number;
  weightedAPY: number;
  yieldScore: number;
  rank: number;
  strategyTags: string[];
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  ensName?: string;
  yieldScore: number;
  totalDeposited: number;
  weightedAPY: number;
  topProtocol: string;
  strategyTags: string[];
}
```

## Yield Score Calculation

The Yield Score (0-100) is a composite metric:

```
yieldScore = (
  (weightedAPY_normalized * 35) +
  (diversification_score * 25) +
  (consistency_score * 20) +
  (capital_efficiency * 20)
)
```

- weightedAPY_normalized: user's weighted APY / 25%, capped at 1.0
- diversification_score: unique protocols used / 5, capped at 1.0
- consistency_score: average position age in days / 90, capped at 1.0
- capital_efficiency: total yield earned / total deposited, normalized

## Build Phases

### Phase 1: Landing Page + Wallet Connect
- Clean landing page explaining what the app does
- RainbowKit wallet connect button
- Header with navigation (Dashboard, Leaderboard)
- Footer with links
- Dark theme (dark background, bright accents — MegaETH brand colors)
- Mobile responsive

### Phase 2: Portfolio Dashboard
- Only visible when wallet is connected
- Read user's positions from supported protocols
- Display each position as a card showing:
  - Protocol name + logo
  - Asset name + icon
  - Amount deposited (formatted with commas, 2 decimal places)
  - Current APY (as percentage)
  - Yield earned so far
  - Position age
- Summary section at top:
  - Total portfolio value
  - Total yield earned
  - Weighted average APY
  - Yield Score with visual gauge (0-100)
- Yield over time chart (line chart using Recharts)

### Phase 3: Leaderboard
- Public page (no wallet connection required to view)
- Table showing top earners:
  - Rank, Address/ENS, Yield Score, Weighted APY, TVL, Top protocol, Strategy tags
- Sortable columns (by score, APY, TVL)
- Search by address
- Pagination (50 per page)

### Phase 4: Public Profiles
- Click any leaderboard entry to see their full profile
- Shows all their positions (same card format as dashboard)
- Strategy Map: Pie chart of protocol allocation + flow chart of fund movements
- Strategy tags displayed prominently
- Copy Strategy section (v1: text description only)

### Phase 5: Social Features
- Users can set a display name (stored client-side for now)
- Share profile link (/profile/0x1234...)
- Strategy of the Week featured section on leaderboard
- Basic activity feed on dashboard

### Phase 6: Copy Strategy (Visual)
- Step-by-step "recipe" of any user's strategy
- Visual flow showing protocol, action, asset, and APY for each step
- "Copy" button that opens each protocol in a new tab (no automated execution in v1)

## Design Guidelines
- Dark theme: Background #0a0a0a, cards #1a1a1a, borders #2a2a2a
- Accent color: #00FF94 (MegaETH green) for highlights, scores, CTAs
- Secondary accent: #3B82F6 (blue) for links and secondary info
- Font: Inter (import from Google Fonts)
- All numbers formatted with appropriate precision
- Skeleton loaders while data loads
- Subtle animations on score changes and card appearances
- Mobile-first responsive design
- Cards with subtle hover effects (slight scale + border glow)

## Protocol Integration Guide

For each protocol, create a reader in `lib/protocols/` that:
1. Takes a user address as input
2. Reads their positions from the protocol's contracts
3. Returns an array of Position objects

Start with Aave V3 (best documentation, most likely on MegaETH early). Add Morpho and Blackhaven readers when their contracts are available.

## Mock Data (For Development)

Until real protocol contracts are available on MegaETH, use realistic mock data with 3-5 positions per user across different protocols and asset types. Generate 50 mock leaderboard entries with varying scores and strategies.

## Environment Variables (.env.local)

```
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key_here
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_CHAIN_ID=6342
```

## Future Features (Not for V1, but design with them in mind)
- AI agent portfolio analyzer and optimizer
- One-click strategy copying (automated transactions)
- Real-time WebSocket updates via MegaETH streaming
- Follow users, comments, strategy discussions
- Copy trade feed: real-time stream of top earner activity
- Alert notifications when top earners change strategies
- Historical yield tracking and backtesting
- Tempo integration for payment/spend features