import type { Position, Transaction, MarketAsset } from "@/types/dashboard"

export function generateMockPositions(): Position[] {
  return [
    { asset: "USDC", amount: 10000, valueUSD: 10000, apy: 5.2, type: "collateral" },
    { asset: "XLM", amount: 50000, valueUSD: 5000, apy: 4.8, type: "collateral" },
    { asset: "USDC", amount: 3000, valueUSD: 3000, apy: 8.5, type: "borrowed" },
    { asset: "ETH", amount: 2, valueUSD: 8000, apy: 3.2, type: "supplied" },
  ]
}

export function generateMockTransactions(): Transaction[] {
  const now = new Date()
  return [
    {
      id: "1",
      type: "deposit",
      asset: "USDC",
      amount: 5000,
      valueUSD: 5000,
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      txHash: "abc123def456",
    },
    {
      id: "2",
      type: "borrow",
      asset: "USDC",
      amount: 1500,
      valueUSD: 1500,
      timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      txHash: "def789ghi012",
    },
    {
      id: "3",
      type: "deposit",
      asset: "XLM",
      amount: 30000,
      valueUSD: 3000,
      timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      txHash: "ghi345jkl678",
    },
    {
      id: "4",
      type: "repay",
      asset: "USDC",
      amount: 500,
      valueUSD: 500,
      timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      txHash: "jkl901mno234",
    },
  ]
}

export function generateMockMarkets(): MarketAsset[] {
  return [
    {
      asset: "USDC",
      icon: "💵",
      totalSupplied: 15000000,
      totalBorrowed: 9000000,
      supplyAPR: 5.2,
      borrowAPY: 8.5,
      utilization: 60,
      price: 1.0,
      priceChange24h: 0.01,
    },
    {
      asset: "XLM",
      icon: "⭐",
      totalSupplied: 80000000,
      totalBorrowed: 32000000,
      supplyAPR: 4.8,
      borrowAPY: 7.2,
      utilization: 40,
      price: 0.12,
      priceChange24h: 2.3,
    },
    {
      asset: "BTC",
      icon: "₿",
      totalSupplied: 500000,
      totalBorrowed: 200000,
      supplyAPR: 2.5,
      borrowAPY: 5.8,
      utilization: 40,
      price: 45000,
      priceChange24h: -1.2,
    },
    {
      asset: "ETH",
      icon: "Ξ",
      totalSupplied: 8000000,
      totalBorrowed: 4800000,
      supplyAPR: 3.2,
      borrowAPY: 6.5,
      utilization: 60,
      price: 3200,
      priceChange24h: 1.8,
    },
  ]
}

export function generateMockChartData() {
  const data = []
  const now = new Date()

  for (let i = 30; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    data.push({
      date: date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      collateral: 15000 + Math.random() * 2000,
      debt: 3000 + Math.random() * 500,
    })
  }

  return data
}
