"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react"

interface SimulationToolProps {
  currentHealthFactor: number
  currentCollateral: number
  currentDebt: number
  collateralFactor?: number
}

export function SimulationTool({
  currentHealthFactor,
  currentCollateral,
  currentDebt,
  collateralFactor = 0.75,
}: SimulationToolProps) {
  const [action, setAction] = useState<"deposit" | "withdraw" | "borrow" | "repay">("deposit")
  const [amount, setAmount] = useState<string>("")
  const [asset, setAsset] = useState<string>("USDC")

  const calculateNewHealthFactor = () => {
    const amountNum = Number.parseFloat(amount) || 0
    let newCollateral = currentCollateral
    let newDebt = currentDebt

    switch (action) {
      case "deposit":
        newCollateral += amountNum
        break
      case "withdraw":
        newCollateral -= amountNum
        break
      case "borrow":
        newDebt += amountNum
        break
      case "repay":
        newDebt -= amountNum
        break
    }

    if (newDebt === 0) return 999 // No debt = infinite health factor
    return (newCollateral * collateralFactor) / newDebt
  }

  const newHealthFactor = calculateNewHealthFactor()
  const healthFactorChange = newHealthFactor - currentHealthFactor
  const isRisky = newHealthFactor < 1.5

  return (
    <Card className="glass-panel border-white/10">
      <CardHeader>
        <CardTitle>Simülasyon Aracı</CardTitle>
        <CardDescription>İşlemlerin Health Factor üzerindeki etkisini hesaplayın</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>İşlem Tipi</Label>
            <Select value={action} onValueChange={(v: any) => setAction(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Yatırma</SelectItem>
                <SelectItem value="withdraw">Çekme</SelectItem>
                <SelectItem value="borrow">Borçlanma</SelectItem>
                <SelectItem value="repay">Ödeme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Varlık</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="XLM">XLM</SelectItem>
                <SelectItem value="BTC">BTC</SelectItem>
                <SelectItem value="ETH">ETH</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Miktar (USD)</Label>
          <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        {amount && Number.parseFloat(amount) > 0 && (
          <div className="space-y-4 p-4 rounded-lg bg-white/5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Mevcut Health Factor</span>
              <span className="font-semibold">{currentHealthFactor.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Yeni Health Factor</span>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${isRisky ? "text-red-500" : "text-green-500"}`}>
                  {newHealthFactor.toFixed(2)}
                </span>
                {healthFactorChange > 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Değişim</span>
              <span className={healthFactorChange > 0 ? "text-green-500" : "text-red-500"}>
                {healthFactorChange > 0 ? "+" : ""}
                {healthFactorChange.toFixed(2)}
              </span>
            </div>

            {isRisky && (
              <div className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-500">
                  <p className="font-semibold">Uyarı: Düşük Health Factor</p>
                  <p>Bu işlem pozisyonunuzu riskli hale getirebilir. Dikkatli olun!</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
