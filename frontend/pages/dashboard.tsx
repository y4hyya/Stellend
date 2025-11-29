"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HealthFactorIndicator } from "@/components/health-factor-indicator"
import { PositionChart } from "@/components/position-chart"
import { TransactionHistory } from "@/components/transaction-history"
import { MarketsOverview } from "@/components/markets-overview"
import { mockContractAPI } from "@/services/mock-contract-api"
import { generateMockTransactions, generateMockMarkets, generateMockChartData } from "@/services/mock-data-generator"
import { TrendingUp, TrendingDown, DollarSign, Shield } from "lucide-react"

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await mockContractAPI.getDashboardData()
        setDashboardData(data)
      } catch (error) {
        console.error("Failed to load dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading || !dashboardData) {
    return (
      <div className="p-8">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const transactions = generateMockTransactions()
  const markets = generateMockMarkets()
  const chartData = generateMockChartData()

  return (
    <div className="p-8 space-y-8 bg-gradient-to-br from-background via-background/95 to-primary/3 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your lending positions and market activity</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="glass-panel border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collateral</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${dashboardData.userCollateral_USD.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{dashboardData.userCollateral_sXLM.toLocaleString()} sXLM</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Borrowed</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${dashboardData.userDebt_sUSDC.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">sUSDC</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Borrow Limit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${dashboardData.borrowLimit.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((dashboardData.userDebt_sUSDC / dashboardData.borrowLimit) * 100).toFixed(1)}% used
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Supplied</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${dashboardData.userSupply_sUSDC.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Earning {dashboardData.supplyAPR.toFixed(2)}% APR</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Factor */}
      <HealthFactorIndicator
        healthFactor={dashboardData.healthFactor}
        collateralValue={dashboardData.userCollateral_USD}
        borrowedValue={dashboardData.userDebt_sUSDC}
      />

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionChart data={chartData} />
        <MarketsOverview markets={markets} />
      </div>

      {/* Transaction History */}
      <TransactionHistory transactions={transactions} />
    </div>
  )
}

