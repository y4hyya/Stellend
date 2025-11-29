export interface Position {
  asset: string
  amount: number
  valueUSD: number
  apy: number
  type: "collateral" | "borrowed" | "supplied"
}

export interface Transaction {
  id: string
  type: "deposit" | "withdraw" | "borrow" | "repay"
  asset: string
  amount: number
  valueUSD: number
  timestamp: Date
  txHash: string
}

export interface MarketAsset {
  asset: string
  icon: string
  totalSupplied: number
  totalBorrowed: number
  supplyAPR: number
  borrowAPY: number
  utilization: number
  price: number
  priceChange24h: number
}

export interface HealthFactorData {
  current: number
  liquidationThreshold: number
  collateralValue: number
  borrowedValue: number
}
