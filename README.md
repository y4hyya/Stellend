# Stellend - Lending Protocol on Stellar

A decentralized lending protocol built on the Stellar blockchain, enabling users to lend and borrow assets with transparent interest rates and collateral management.

## Overview

Stellend is a lending protocol that leverages Stellar's fast, low-cost transactions and Soroban smart contracts to provide a secure and efficient lending marketplace. Users can:

- **Lend assets** and earn interest
- **Borrow assets** by providing collateral
- **Manage positions** with real-time health ratios
- **Liquidate** undercollateralized positions

## Architecture

### Smart Contracts (Soroban)
- **Lending Pool**: Manages asset deposits and withdrawals
- **Collateral Manager**: Handles collateral deposits and liquidation logic
- **Interest Rate Model**: Calculates dynamic interest rates based on utilization
- **Oracle**: Price feeds for collateral valuation

### SDK
- JavaScript/TypeScript SDK for interacting with the protocol
- Helper functions for common operations
- Type definitions

### Frontend
- Next.js web application for interacting with the protocol
- Dashboard for monitoring positions and market data
- Integrated with Freighter wallet for transaction signing
- Real-time TVL and health factor displays

## Tech Stack

- **Smart Contracts**: Rust (Soroban)
- **SDK**: TypeScript/JavaScript
- **Frontend**: React/Next.js (optional)
- **Testing**: Stellar Testnet

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Stellar CLI](https://soroban.stellar.org/docs/getting-started/setup)
- [Node.js](https://nodejs.org/) (v18+)
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/y4hyya/Stellend.git
cd Stellend
```

2. Install dependencies:
```bash
# Install all workspace dependencies (SDK + Frontend)
npm install

# Install Rust dependencies (for smart contracts)
cd contracts
cargo build
```

### Development

#### Smart Contracts

```bash
cd contracts
# Build contracts
cargo build --target wasm32-unknown-unknown --release

# Test contracts
cargo test

# Deploy to testnet
soroban deploy --wasm target/wasm32-unknown-unknown/release/lending_pool.wasm
```

#### SDK

```bash
cd sdk
npm run build
npm test
```

#### Frontend

```bash
cd frontend
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
```

#### Scripts

```bash
# Update oracle prices (normal mode)
cd scripts
npm run update-price

# Update oracle prices (crash mode for demo)
npm run update-price -- --crash
```

## Project Structure

```
Stellend/
├── contracts/          # Soroban smart contracts
│   ├── lending_pool/  # Main lending pool contract
│   ├── collateral/    # Collateral management
│   └── oracle/        # Price oracle
├── sdk/               # TypeScript SDK for protocol interaction
├── frontend/          # Next.js web application
│   ├── app/           # Next.js app router pages
│   ├── components/    # React components (UI, pages, etc.)
│   ├── hooks/         # Custom React hooks
│   ├── context/       # React context providers
│   ├── services/      # API and contract services
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── scripts/           # Utility scripts
│   └── update_price.ts # Oracle price keeper script
├── docs/              # Documentation
└── tests/             # Integration tests
```

## Features

- [ ] Asset deposit and withdrawal
- [ ] Collateral management
- [ ] Borrowing with collateral
- [ ] Interest rate calculation
- [ ] Liquidation mechanism
- [ ] Governance (future)

## Security

This protocol is currently under development. Do not use with mainnet assets until audited.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License

## Links

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Testnet](https://developers.stellar.org/docs/encyclopedia/testnet)

