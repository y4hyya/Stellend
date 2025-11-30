"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HealthFactorIndicator } from "@/components/health-factor-indicator"
import { apogeeContractAPI, sorobanService, type DashboardData } from "@/services/soroban-service"
import { useWallet } from "@/hooks/use-wallet"
import { useTransaction, getButtonText } from "@/hooks/use-transaction"
import { OPERATION_ERRORS } from "@/utils/errors"
import { Shield, ArrowDown, ArrowUp, AlertTriangle, Loader2, CheckCircle, Calculator, AlertCircle } from "lucide-react"
import { toast } from "sonner"

export default function CollateralPage() {
  const { publicKey, isConnected, signTx } = useWallet()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [walletBalances, setWalletBalances] = useState<{ sXLM: number; sUSDC: number } | null>(null)
  const [xlmPrice, setXlmPrice] = useState<number>(0.35)
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")

  const loadData = useCallback(async () => {
      try {
      const [dashboard, balances, price] = await Promise.all([
        apogeeContractAPI.getDashboardData(publicKey || ""),
        apogeeContractAPI.getWalletBalances(publicKey || ""),
        sorobanService.getPrice("XLM"),
        ])
        setDashboardData(dashboard)
        setWalletBalances(balances)
      setXlmPrice(price)
      } catch (error) {
        console.error("Failed to load data:", error)
      toast.error("Failed to load data", {
        description: "Could not fetch on-chain data. Please refresh."
      })
      } finally {
        setLoading(false)
      }
  }, [publicKey])

  // Transaction hooks
  const depositTx = useTransaction({
    successMessage: "Collateral deposited successfully!",
    onSuccess: async () => {
      setDepositAmount("")
      await loadData()
    }
  })

  const withdrawTx = useTransaction({
    successMessage: "Collateral withdrawn successfully!",
    onSuccess: async () => {
      setWithdrawAmount("")
      await loadData()
    }
  })

  useEffect(() => {
    if (isConnected) {
      loadData()
    }
  }, [isConnected, loadData])

  // Validate deposit amount
  const validateDeposit = (amount: number): string | null => {
    if (!amount || amount <= 0) return "Please enter a valid amount"
    if (amount < 10) return OPERATION_ERRORS.depositCollateral.minAmount
    if (walletBalances && amount > walletBalances.sXLM) {
      return OPERATION_ERRORS.depositCollateral.insufficientBalance
    }
    return null
  }

  // Validate withdraw amount
  const validateWithdraw = (amount: number): string | null => {
    if (!amount || amount <= 0) return "Please enter a valid amount"
    if (!dashboardData) return "Loading..."
    
    if (amount > dashboardData.userCollateral_sXLM) {
      return OPERATION_ERRORS.withdrawCollateral.insufficientCollateral
    }
    
    // Check if withdrawal would cause liquidation
    if (dashboardData.userDebt_sUSDC > 0) {
      const newCollateralXLM = dashboardData.userCollateral_sXLM - amount
      const newCollateralUSD = newCollateralXLM * xlmPrice
      const newHF = (newCollateralUSD * 0.8) / dashboardData.userDebt_sUSDC
      
      if (newHF < 1.0) {
        return OPERATION_ERRORS.withdrawCollateral.wouldLiquidate
      }
    }
    
    return null
  }

  // Calculate new health factor after withdrawal
  const calculateNewHFAfterWithdraw = (withdrawXLM: number): number => {
    if (!dashboardData || dashboardData.userDebt_sUSDC <= 0) return 999
    const newCollateralXLM = dashboardData.userCollateral_sXLM - withdrawXLM
    const newCollateralUSD = newCollateralXLM * xlmPrice
    return (newCollateralUSD * 0.8) / dashboardData.userDebt_sUSDC
  }

  // Calculate max safe withdraw
  const calculateMaxSafeWithdraw = (): number => {
    if (!dashboardData || dashboardData.userDebt_sUSDC <= 0) {
      return dashboardData?.userCollateral_sXLM || 0
    }
    // Calculate collateral needed to maintain HF of 1.5
    const minCollateralUSD = (dashboardData.userDebt_sUSDC * 1.5) / 0.8
    const minCollateralXLM = minCollateralUSD / xlmPrice
    const maxWithdraw = dashboardData.userCollateral_sXLM - minCollateralXLM
    return Math.max(0, maxWithdraw)
  }

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount)
    const error = validateDeposit(amount)
    if (error) {
      toast.error("Invalid Amount", { description: error })
      return
    }

    if (!publicKey) {
      toast.error("Wallet not connected")
      return
    }

    await depositTx.execute(() =>
      apogeeContractAPI.depositCollateral(publicKey, amount, signTx)
    )
  }

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount)
    const error = validateWithdraw(amount)
    if (error) {
      toast.error("Cannot Withdraw", { description: error })
      return
    }

    // Warn if health factor would be low
    if (dashboardData && dashboardData.userDebt_sUSDC > 0) {
      const newHF = calculateNewHFAfterWithdraw(amount)
      if (newHF < 1.5) {
        toast.warning("Warning: Low Health Factor", {
          description: `Withdrawing this amount would set your Health Factor to ${newHF.toFixed(2)}. This is risky!`,
          duration: 5000,
        })
      }
    }

    if (!publicKey) {
      toast.error("Wallet not connected")
      return
    }

    await withdrawTx.execute(() =>
      apogeeContractAPI.withdrawCollateral(publicKey, amount, signTx)
    )
  }

  const isProcessing = depositTx.isLoading || withdrawTx.isLoading

  if (loading || !dashboardData || !walletBalances) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading on-chain data...
        </div>
      </div>
    )
  }

  const maxSafeWithdraw = calculateMaxSafeWithdraw()
  const hasDebt = dashboardData.userDebt_sUSDC > 0
  const isAtRisk = dashboardData.healthFactor < 1.5 && hasDebt

  // Calculate projected HF for the withdraw preview
  const withdrawPreviewAmount = parseFloat(withdrawAmount) || 0
  const projectedHF = withdrawPreviewAmount > 0 && hasDebt 
    ? calculateNewHFAfterWithdraw(withdrawPreviewAmount) 
    : null

  return (
    <div className="p-8 space-y-8 bg-gradient-to-br from-background via-background/95 to-primary/3 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold mb-2">Collateral Management</h1>
        <p className="text-muted-foreground">Manage your collateral to secure your borrowing position</p>
      </div>

      {/* At Risk Warning */}
      {isAtRisk && (
        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5" />
          <div>
            <p className="font-medium text-orange-500">Position at Risk</p>
            <p className="text-sm text-muted-foreground">
              Your Health Factor is {dashboardData.healthFactor.toFixed(2)}. 
              Consider adding more collateral or repaying some debt.
            </p>
          </div>
        </div>
      )}

      {/* Health Factor */}
      <HealthFactorIndicator
        healthFactor={dashboardData.healthFactor}
        collateralValue={dashboardData.userCollateral_USD}
        borrowedValue={dashboardData.userDebt_sUSDC}
        xlmPrice={xlmPrice}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit Collateral */}
        <Card className="glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDown className="w-5 h-5 text-green-500" />
              Deposit Collateral
            </CardTitle>
            <CardDescription>Add XLM to your collateral to increase your borrowing capacity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (XLM)</Label>
              <Input
                id="deposit-amount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={isProcessing}
                className={depositTx.state === "error" ? "border-red-500" : ""}
              />
              <div className="flex justify-between text-sm">
                <p className="text-muted-foreground">
                  Balance: {walletBalances.sXLM.toLocaleString()} XLM
                </p>
                <button 
                  className="text-primary hover:underline"
                  onClick={() => setDepositAmount(walletBalances.sXLM.toString())}
                  disabled={isProcessing}
                >
                  Max
                </button>
              </div>
              <p className="text-muted-foreground text-sm">
                Value: ${(parseFloat(depositAmount || "0") * xlmPrice).toFixed(2)} @ ${xlmPrice.toFixed(4)}/XLM
              </p>
            </div>

            <Button 
              onClick={handleDeposit} 
              disabled={isProcessing || !isConnected || !depositAmount} 
              className="w-full"
            >
              {depositTx.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {getButtonText(depositTx.state, "Deposit Collateral")}
                </>
              ) : depositTx.state === "success" ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Deposited!
                </>
              ) : (
                "Deposit Collateral"
              )}
            </Button>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-2">
                <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Current Collateral</p>
                  <p className="text-muted-foreground">
                    {dashboardData.userCollateral_sXLM.toLocaleString()} XLM 
                    (${dashboardData.userCollateral_USD.toLocaleString()})
                  </p>
                  <p className="text-blue-500 mt-1">
                    Borrow capacity: ${dashboardData.borrowLimit.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdraw Collateral */}
        <Card className={`glass-panel border-white/10 ${isAtRisk ? "opacity-75" : ""}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUp className="w-5 h-5 text-orange-500" />
              Withdraw Collateral
              {isAtRisk && <span className="text-xs bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded">Risky</span>}
            </CardTitle>
            <CardDescription>Remove XLM from your collateral (may affect health factor)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (XLM)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isProcessing}
                className={withdrawTx.state === "error" ? "border-red-500" : ""}
              />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your collateral:</span>
                  <span>{dashboardData.userCollateral_sXLM.toLocaleString()} XLM</span>
                </div>
                {hasDebt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Safe to withdraw:</span>
                    <span className={maxSafeWithdraw <= 0 ? "text-red-500" : "text-green-500"}>
                      {maxSafeWithdraw.toFixed(2)} XLM
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Projected Health Factor Preview */}
            {projectedHF !== null && projectedHF < 999 && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                projectedHF < 1.0 ? "bg-red-500/20 border border-red-500/30" :
                projectedHF < 1.5 ? "bg-yellow-500/20 border border-yellow-500/30" :
                "bg-green-500/20 border border-green-500/30"
              }`}>
                <Calculator className="w-4 h-4" />
                <span className="text-sm">
                  New Health Factor: <strong>{projectedHF.toFixed(2)}</strong>
                  {projectedHF < 1.0 && " ⚠️ Would be liquidatable!"}
                  {projectedHF >= 1.0 && projectedHF < 1.5 && " ⚠️ Risky"}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const maxW = hasDebt ? Math.min(maxSafeWithdraw, dashboardData.userCollateral_sXLM) : dashboardData.userCollateral_sXLM
                  setWithdrawAmount(Math.max(0, maxW).toFixed(2))
                }}
                variant="outline"
                className="flex-1"
                disabled={isProcessing || dashboardData.userCollateral_sXLM <= 0}
              >
                {hasDebt ? "Safe Max" : "Max"}
              </Button>
              <Button 
                onClick={handleWithdraw} 
                disabled={isProcessing || !isConnected || dashboardData.userCollateral_sXLM <= 0 || !withdrawAmount} 
                variant="outline" 
                className="flex-1"
              >
                {withdrawTx.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {getButtonText(withdrawTx.state, "Withdraw", { signingText: "Signing..." })}
                  </>
                ) : withdrawTx.state === "success" ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Done!
                  </>
                ) : (
                  "Withdraw"
                )}
            </Button>
            </div>

            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Warning</p>
                  <p className="text-muted-foreground">
                    Withdrawing collateral will reduce your health factor. 
                    {hasDebt 
                      ? ` Keep it above 1.5 for safety. You have ${dashboardData.userDebt_sUSDC.toLocaleString()} USDC in debt.`
                      : " You have no debt, so you can withdraw freely."}
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
          <CardTitle>About Collateral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Collateral is used to secure your borrowing position. The more collateral you provide, the more you can borrow.
          </p>
          <p>• Your health factor must stay above 1.0 to avoid liquidation.</p>
          <p>• Withdrawing collateral reduces your borrowing capacity and may affect your health factor.</p>
          <p>• Collateral value is calculated based on current on-chain oracle prices.</p>
          <p>• Current XLM price: ${xlmPrice.toFixed(4)} | Liquidation threshold: 80%</p>
        </CardContent>
      </Card>
    </div>
  )
}
