"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HealthFactorIndicator } from "@/components/health-factor-indicator"
import { mockContractAPI } from "@/services/mock-contract-api"
import { TrendingDown, TrendingUp, AlertTriangle, DollarSign } from "lucide-react"
import { toast } from "sonner"

export default function BorrowRepayPage() {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [walletBalances, setWalletBalances] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [borrowAmount, setBorrowAmount] = useState("")
  const [repayAmount, setRepayAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dashboard, balances] = await Promise.all([
          mockContractAPI.getDashboardData(),
          mockContractAPI.getWalletBalances(),
        ])
        setDashboardData(dashboard)
        setWalletBalances(balances)
      } catch (error) {
        console.error("Failed to load data:", error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleBorrow = async () => {
    const amount = parseFloat(borrowAmount)
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setIsProcessing(true)
    try {
      await mockContractAPI.borrow(amount)
      toast.success(`Successfully borrowed ${amount} sUSDC`)
      setBorrowAmount("")
      // Reload data
      const [dashboard, balances] = await Promise.all([
        mockContractAPI.getDashboardData(),
        mockContractAPI.getWalletBalances(),
      ])
      setDashboardData(dashboard)
      setWalletBalances(balances)
    } catch (error: any) {
      toast.error(error.message || "Failed to borrow")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRepay = async () => {
    const amount = parseFloat(repayAmount)
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setIsProcessing(true)
    try {
      await mockContractAPI.repay(amount)
      toast.success(`Successfully repaid ${amount} sUSDC`)
      setRepayAmount("")
      // Reload data
      const [dashboard, balances] = await Promise.all([
        mockContractAPI.getDashboardData(),
        mockContractAPI.getWalletBalances(),
      ])
      setDashboardData(dashboard)
      setWalletBalances(balances)
    } catch (error: any) {
      toast.error(error.message || "Failed to repay")
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading || !dashboardData || !walletBalances) {
    return (
      <div className="p-8">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const availableToBorrow = dashboardData.borrowLimit - dashboardData.userDebt_sUSDC

  return (
    <div className="p-8 space-y-8 bg-gradient-to-br from-background via-background/95 to-primary/3 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold mb-2">Borrow & Repay</h1>
        <p className="text-muted-foreground">Borrow assets using your collateral or repay existing debt</p>
      </div>

      {/* Health Factor */}
      <HealthFactorIndicator
        healthFactor={dashboardData.healthFactor}
        collateralValue={dashboardData.userCollateral_USD}
        borrowedValue={dashboardData.userDebt_sUSDC}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Borrow */}
        <Card className="glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-purple-500" />
              Borrow sUSDC
            </CardTitle>
            <CardDescription>Borrow sUSDC against your collateral</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="borrow-amount">Amount (sUSDC)</Label>
              <Input
                id="borrow-amount"
                type="number"
                placeholder="0.00"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
              />
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  Available to borrow: ${availableToBorrow.toLocaleString()} sUSDC
                </p>
                <p className="text-muted-foreground">Borrow APY: {dashboardData.borrowAPR.toFixed(2)}%</p>
              </div>
            </div>
            <Button onClick={handleBorrow} disabled={isProcessing} className="w-full">
              {isProcessing ? "Processing..." : "Borrow sUSDC"}
            </Button>
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-start gap-2">
                <DollarSign className="w-5 h-5 text-purple-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Current Debt</p>
                  <p className="text-muted-foreground">
                    {dashboardData.userDebt_sUSDC.toLocaleString()} sUSDC
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Borrow Limit: ${dashboardData.borrowLimit.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Repay */}
        <Card className="glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Repay Debt
            </CardTitle>
            <CardDescription>Repay your borrowed sUSDC to reduce debt and improve health factor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repay-amount">Amount (sUSDC)</Label>
              <Input
                id="repay-amount"
                type="number"
                placeholder="0.00"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
              />
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  Current debt: {dashboardData.userDebt_sUSDC.toLocaleString()} sUSDC
                </p>
                <p className="text-muted-foreground">
                  Wallet balance: {walletBalances.sUSDC.toLocaleString()} sUSDC
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setRepayAmount(dashboardData.userDebt_sUSDC.toString())}
                variant="outline"
                className="flex-1"
              >
                Max
              </Button>
              <Button onClick={handleRepay} disabled={isProcessing} className="flex-1">
                {isProcessing ? "Processing..." : "Repay"}
              </Button>
            </div>
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-green-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Tip</p>
                  <p className="text-muted-foreground">
                    Repaying debt will improve your health factor and reduce interest payments.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <CardTitle>About Borrowing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• You can borrow up to {((dashboardData.borrowLimit / dashboardData.userCollateral_USD) * 100).toFixed(0)}% of your collateral value.</p>
          <p>• Borrowing reduces your health factor. Keep it above 1.5 for safety.</p>
          <p>• You'll pay interest (APY) on borrowed amounts.</p>
          <p>• Repaying debt improves your health factor and reduces interest costs.</p>
        </CardContent>
      </Card>
    </div>
  )
}

