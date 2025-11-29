# Stellend Frontend

Next.js web application for the Stellend lending protocol on Stellar.

## Overview

The Stellend frontend provides a modern, user-friendly interface for interacting with the Peer-to-Pool lending protocol. Built with Next.js 16, React 19, and Tailwind CSS.

## Features

- 🏦 **Dashboard**: Real-time overview of user positions, TVL, and market data
- 💰 **Lend & Withdraw**: Deposit assets to earn interest, withdraw when needed
- 📊 **Borrow & Repay**: Borrow assets against collateral with real-time health monitoring
- 📈 **Markets Overview**: View all available markets and their rates
- 🔒 **Wallet Integration**: Seamless connection with Freighter wallet
- 🎨 **Modern UI**: Built with Radix UI components and Tailwind CSS
- 🌓 **Dark Mode**: Full theme support

## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Or with pnpm
pnpm install
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

The application will be available at `http://localhost:3000`

## Project Structure

```
frontend/
├── app/                 # Next.js app router
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Landing page
│   └── globals.css     # Global styles
├── components/          # React components
│   ├── ui/             # Reusable UI components (Radix UI)
│   ├── dashboard.tsx   # Dashboard component
│   ├── markets-overview.tsx
│   └── ...
├── pages/               # Page components
│   ├── dashboard.tsx
│   ├── lend-withdraw.tsx
│   ├── borrow-repay.tsx
│   └── collateral.tsx
├── hooks/               # Custom React hooks
│   ├── use-wallet.ts   # Wallet connection hook
│   └── ...
├── context/             # React context
│   └── wallet-context.tsx
├── services/            # API and contract services
│   ├── mock-contract-api.ts
│   └── ...
├── types/               # TypeScript types
├── utils/               # Utility functions
└── public/              # Static assets
```

## Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Future Network ; October 2022
NEXT_PUBLIC_RPC_URL=https://rpc-futurenet.stellar.org
NEXT_PUBLIC_LENDING_POOL_CONTRACT_ID=<contract-address>
NEXT_PUBLIC_ORACLE_CONTRACT_ID=<contract-address>
NEXT_PUBLIC_COLLATERAL_CONTRACT_ID=<contract-address>
```

## Wallet Integration

The frontend integrates with Freighter wallet for signing transactions. Users need to:

1. Install Freighter browser extension
2. Connect their wallet
3. Switch to Stellar Futurenet network

## Tech Stack

- **Framework**: Next.js 16
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4
- **Components**: Radix UI
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **Icons**: Lucide React
- **Theme**: next-themes

## Development Notes

- The frontend currently uses mock data services for development
- Contract integration will be implemented using the Stellend SDK
- All contract interactions go through the SDK layer

## License

MIT License
