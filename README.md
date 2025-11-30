# Stellend - Decentralized Lending Protocol on Stellar

A peer-to-pool lending protocol built on Stellar Futurenet using Soroban smart contracts. Users can supply assets to earn interest, deposit collateral, and borrow against their collateral.

## Overview

Stellend enables:
- **Supply USDC** to the lending pool and earn interest
- **Deposit XLM** as collateral for borrowing
- **Borrow USDC** against your XLM collateral (up to 75% LTV)
- **Monitor health factor** to avoid liquidation
- **Real-time price feeds** via on-chain oracle

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│                    Dashboard, Supply, Borrow UI                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Soroban Smart Contracts                      │
├─────────────────┬──────────────────────┬────────────────────────┤
│   Lending Pool  │  Interest Rate Model │     Price Oracle       │
│                 │                      │                        │
│ • deposit()     │ • get_borrow_rate()  │ • set_price()          │
│ • withdraw()    │ • get_supply_rate()  │ • get_price()          │
│ • borrow()      │                      │ • set_price_chaos()    │
│ • repay()       │                      │                        │
│ • deposit_      │                      │                        │
│   collateral()  │                      │                        │
└─────────────────┴──────────────────────┴────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Stellar Futurenet (Soroban)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Smart Contracts**: Rust + Soroban SDK
- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Wallet**: Freighter Wallet integration
- **Scripts**: TypeScript (price keeper, deployment)
- **Network**: Stellar Futurenet

## Project Structure

```
Stellend/
├── contracts/                    # Soroban smart contracts
│   ├── Cargo.toml               # Workspace configuration
│   ├── pool/                    # Main lending pool contract
│   │   └── src/lib.rs          # Deposits, borrows, collateral
│   ├── interest_rate_model/     # Interest rate calculations
│   │   └── src/lib.rs          # Kinked rate model
│   └── price_oracle/            # On-chain price storage
│       └── src/lib.rs          # XLM/USD, USDC/USD prices
├── scripts/                     # TypeScript utility scripts
│   ├── update_price.ts         # Oracle price keeper
│   └── package.json
├── frontend/                    # Next.js web application
│   ├── app/                    # App router pages
│   ├── components/             # React components
│   ├── pages/                  # Page components
│   └── services/               # API services
├── sdk/                        # TypeScript SDK (optional)
└── docs/                       # Documentation
```

## Getting Started

### Prerequisites

1. **Rust** (latest stable):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add wasm32-unknown-unknown
   ```

2. **Soroban CLI**:
   ```bash
   cargo install --locked soroban-cli
   ```

3. **Node.js** (v18+):
   ```bash
   # Using nvm (recommended)
   nvm install 18
   nvm use 18
   ```

4. **Freighter Wallet** (browser extension):
   - Install from [freighter.app](https://www.freighter.app/)
   - Switch to Futurenet network

### Installation

```bash
# Clone the repository
git clone https://github.com/y4hyya/Stellend.git
cd Stellend

# Install Node.js dependencies
npm install

# Install contract dependencies
cd contracts
cargo build
```

## Building Contracts

```bash
cd contracts

# Build all contracts
cargo build --target wasm32-unknown-unknown --release

# Or build individually
cargo build -p stellend-pool --target wasm32-unknown-unknown --release
cargo build -p stellend-interest-rate-model --target wasm32-unknown-unknown --release
cargo build -p stellend-price-oracle --target wasm32-unknown-unknown --release
```

The compiled WASM files will be in:
```
target/wasm32-unknown-unknown/release/
├── stellend_pool.wasm
├── stellend_interest_rate_model.wasm
└── stellend_price_oracle.wasm
```

## Testing Contracts

```bash
cd contracts

# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific contract tests
cargo test -p stellend-interest-rate-model
```

## Deploying to Futurenet

### Quick Deployment (Recommended)

Use the automated deployment scripts:

```bash
# 1. Build contracts
cd contracts
cargo build --target wasm32-unknown-unknown --release

# 2. Generate and fund deployer account
soroban keys generate deployer --network futurenet
curl "https://friendbot-futurenet.stellar.org/?addr=$(soroban keys address deployer)"

# 3. Get secret key
export SECRET_KEY=$(soroban keys show deployer)

# 4. Deploy everything!
cd ../scripts
npm install
npm run deploy-all

# 5. Seed pool with liquidity
npm run seed-pool

# 6. Create a test user
npm run fund-user -- --new
```

This will:
- Deploy all 3 contracts (Pool, Oracle, Interest Rate Model)
- Set up XLM and USDC tokens (via Stellar Asset Contract)
- Initialize all contracts
- Set initial prices ($0.30 XLM, $1.00 USDC)
- Save everything to `scripts/deployment.json`

### Manual Deployment

For more control, you can deploy contracts manually:

#### 1. Create a Futurenet Account

```bash
# Generate a new keypair
soroban keys generate deployer --network futurenet

# Fund it with Friendbot
curl "https://friendbot-futurenet.stellar.org/?addr=$(soroban keys address deployer)"
```

#### 2. Deploy Contracts

```bash
cd contracts

# Deploy Price Oracle
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellend_price_oracle.wasm \
  --source deployer \
  --network futurenet

# Deploy Interest Rate Model
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellend_interest_rate_model.wasm \
  --source deployer \
  --network futurenet

# Deploy Lending Pool
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellend_pool.wasm \
  --source deployer \
  --network futurenet
```

#### 3. Initialize Contracts

```bash
# Initialize Price Oracle
soroban contract invoke \
  --id <ORACLE_CONTRACT_ID> \
  --source deployer \
  --network futurenet \
  -- \
  initialize \
  --admin <ADMIN_ADDRESS>

# Initialize Interest Rate Model (uses default parameters)
soroban contract invoke \
  --id <INTEREST_RATE_MODEL_CONTRACT_ID> \
  --source deployer \
  --network futurenet \
  -- \
  initialize_default

# Initialize Lending Pool
soroban contract invoke \
  --id <POOL_CONTRACT_ID> \
  --source deployer \
  --network futurenet \
  -- \
  initialize \
  --admin <ADMIN_ADDRESS> \
  --usdc_token <USDC_TOKEN_ID> \
  --xlm_token <XLM_TOKEN_ID> \
  --interest_rate_model <INTEREST_RATE_MODEL_CONTRACT_ID> \
  --price_oracle <ORACLE_CONTRACT_ID>
```

#### 4. Set Initial Prices

```bash
# Set XLM price to $0.30 (3_000_000 with 7 decimals)
soroban contract invoke \
  --id <ORACLE_CONTRACT_ID> \
  --source deployer \
  --network futurenet \
  -- \
  set_price \
  --asset XLM \
  --price 3000000
```

## Seeding the Pool

After deployment, add liquidity to the pool:

```bash
cd scripts

# This creates a whale account, mints 1M USDC, and supplies 500K to the pool
npm run seed-pool
```

## Creating Test Users

Fund demo accounts for testing:

```bash
# Create a new user with 10K XLM + 10K USDC
npm run fund-user -- --new

# Fund an existing address
npm run fund-user -- GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Custom amounts
npm run fund-user -- --new --xlm 50000 --usdc 25000
```

## Running the Price Keeper

The price keeper script fetches real-time prices from CoinGecko and updates the oracle.

```bash
cd scripts

# Install dependencies (if not already done)
npm install

# Set environment variables (or use deployment.json)
export SECRET_KEY="your_deployer_secret_key"
export ORACLE_CONTRACT_ID="your_oracle_contract_id"  # Optional if using deployment.json

# Run price update (normal mode)
npm run update-price

# Run with chaos mode (50% price drop for testing liquidations)
npm run update-price:crash

# Use mock prices (no API call)
npm run update-price:mock
```

## Deployment Info

After running `npm run deploy-all`, all contract IDs are saved to `scripts/deployment.json`:

```json
{
  "network": "futurenet",
  "contracts": {
    "pool": "CXXXXXX...",
    "oracle": "CXXXXXX...",
    "interestRateModel": "CXXXXXX..."
  },
  "tokens": {
    "xlm": "CXXXXXX...",
    "usdc": "CXXXXXX...",
    "usdcIssuer": "GXXXXXX..."
  },
  "accounts": {
    "deployer": "GXXXXXX...",
    "whale": "GXXXXXX..."
  }
}
```

Other scripts (`seed-pool`, `fund-user`, `update-price`) will automatically read from this file.

## Running the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Protocol Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| LTV Ratio | 75% | Maximum borrow amount relative to collateral |
| Liquidation Threshold | 80% | Health factor threshold for liquidation |
| Base Rate | 0% | Minimum interest rate |
| Slope 1 | 4% | Rate increase up to optimal utilization |
| Slope 2 | 75% | Rate increase above optimal utilization |
| Optimal Utilization | 80% | Target pool utilization |

## Health Factor

The health factor determines the safety of a borrowing position:

```
Health Factor = (Collateral Value × Liquidation Threshold) / Borrowed Value
```

- **Health Factor > 1.5**: Safe
- **Health Factor 1.0 - 1.5**: Risky
- **Health Factor < 1.0**: Liquidatable

## Interest Rate Model



<img width="1042" height="576" alt="image" src="https://github.com/user-attachments/assets/01cba5b3-a5ef-412a-b75b-a33a0244fd65" />


The protocol uses a kinked interest rate model:

```
If utilization ≤ 80%:
  Rate = 0% + (utilization / 80%) × 4%

If utilization > 80%:
  Rate = 4% + ((utilization - 80%) / 20%) × 75%
```
<img width="1980" height="1180" alt="image" src="https://github.com/user-attachments/assets/2a94b6ed-8b92-4039-85f4-80f194b286b6" />
This incentivizes depositors when utilization is high.

## Network Configuration

| Network | RPC URL | Passphrase |
|---------|---------|------------|
| Futurenet | https://rpc-futurenet.stellar.org | Test SDF Future Network ; October 2022 |
| Testnet | https://soroban-testnet.stellar.org | Test SDF Network ; September 2015 |

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

⚠️ **This protocol is in development and unaudited.** Do not use with real assets.

## License

MIT License - see [LICENSE](LICENSE)

## Links

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Freighter Wallet](https://www.freighter.app/)
