"use client"

import { Progress } from "@/components/ui/progress"
import { AlertTriangle, CheckCircle, AlertCircle } from "lucide-react"

interface HealthFactorIndicatorProps {
  healthFactor: number
  collateralValue: number
  borrowedValue: number
}

export function HealthFactorIndicator({ healthFactor, collateralValue, borrowedValue }: HealthFactorIndicatorProps) {
  const getHealthStatus = () => {
    if (healthFactor >= 2) return { color: "text-green-500", bg: "bg-green-500", icon: CheckCircle, label: "Güvenli" }
    if (healthFactor >= 1.5)
      return { color: "text-yellow-500", bg: "bg-yellow-500", icon: AlertCircle, label: "Dikkat" }
    if (healthFactor >= 1.2)
      return { color: "text-orange-500", bg: "bg-orange-500", icon: AlertTriangle, label: "Risk" }
    return { color: "text-red-500", bg: "bg-red-500", icon: AlertTriangle, label: "Yüksek Risk" }
  }

  const status = getHealthStatus()
  const StatusIcon = status.icon

  // Progress value (100% at HF=2, 0% at HF=1)
  const progressValue = Math.min(100, Math.max(0, ((healthFactor - 1) / 1) * 100))

  return (
    <div className="glass-panel p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Health Factor</h3>
        <div className={`flex items-center gap-2 ${status.color}`}>
          <StatusIcon className="w-5 h-5" />
          <span className="font-semibold">{status.label}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{healthFactor.toFixed(2)}</span>
          <span className="text-sm text-muted-foreground">/ 2.00+</span>
        </div>
        <Progress value={progressValue} className="h-3" />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
        <div>
          <p className="text-sm text-muted-foreground">Teminat Değeri</p>
          <p className="text-xl font-semibold">${collateralValue.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Borç Değeri</p>
          <p className="text-xl font-semibold">${borrowedValue.toLocaleString()}</p>
        </div>
      </div>

      <div className="text-sm text-muted-foreground bg-white/5 p-3 rounded-lg">
        <p>Health Factor 1.00'ın altına düşerse pozisyonunuz tasfiye edilebilir.</p>
      </div>
    </div>
  )
}
