# Scripts

Utility scripts for Stellend protocol operations.

## Available Scripts

### `update_price.ts`

Price oracle keeper script that updates asset prices on-chain.

**Usage:**
```bash
# Normal mode - updates price from CoinGecko
npm run update-price

# Crash mode - simulates 50% price drop for demo
npm run update-price -- --crash
```

**Features:**
- Fetches XLM/USD price from CoinGecko API
- Updates on-chain oracle contract
- Supports "chaos mode" for demo purposes (50% price crash)

## Setup

Install dependencies:
```bash
npm install
```

Configure environment variables:
- `ORACLE_CONTRACT_ID`: The deployed oracle contract address
- `NETWORK`: Network to use (futurenet/testnet/mainnet)
- `SECRET_KEY`: Account secret key for signing transactions

