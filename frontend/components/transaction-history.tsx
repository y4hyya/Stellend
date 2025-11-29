"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, ArrowUpRight, ArrowDownRight } from "lucide-react"
import type { Transaction } from "@/types/dashboard"

interface TransactionHistoryProps {
  transactions: Transaction[]
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [filter, setFilter] = useState<"all" | Transaction["type"]>("all")

  const filteredTransactions = filter === "all" ? transactions : transactions.filter((tx) => tx.type === filter)

  const getTransactionIcon = (type: Transaction["type"]) => {
    return type === "deposit" || type === "borrow" ? (
      <ArrowDownRight className="w-4 h-4" />
    ) : (
      <ArrowUpRight className="w-4 h-4" />
    )
  }

  const getTransactionColor = (type: Transaction["type"]) => {
    switch (type) {
      case "deposit":
        return "bg-green-500/20 text-green-500"
      case "withdraw":
        return "bg-blue-500/20 text-blue-500"
      case "borrow":
        return "bg-purple-500/20 text-purple-500"
      case "repay":
        return "bg-orange-500/20 text-orange-500"
    }
  }

  const getTransactionLabel = (type: Transaction["type"]) => {
    switch (type) {
      case "deposit":
        return "Yatırma"
      case "withdraw":
        return "Çekme"
      case "borrow":
        return "Borçlanma"
      case "repay":
        return "Ödeme"
    }
  }

  return (
    <Card className="glass-panel border-white/10">
      <CardHeader>
        <CardTitle>İşlem Geçmişi</CardTitle>
        <CardDescription>Tüm platform işlemleriniz</CardDescription>
        <div className="flex gap-2 pt-4">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Tümü
          </Button>
          <Button size="sm" variant={filter === "deposit" ? "default" : "outline"} onClick={() => setFilter("deposit")}>
            Yatırma
          </Button>
          <Button
            size="sm"
            variant={filter === "withdraw" ? "default" : "outline"}
            onClick={() => setFilter("withdraw")}
          >
            Çekme
          </Button>
          <Button size="sm" variant={filter === "borrow" ? "default" : "outline"} onClick={() => setFilter("borrow")}>
            Borçlanma
          </Button>
          <Button size="sm" variant={filter === "repay" ? "default" : "outline"} onClick={() => setFilter("repay")}>
            Ödeme
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredTransactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${getTransactionColor(tx.type)}`}>{getTransactionIcon(tx.type)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{getTransactionLabel(tx.type)}</span>
                    <Badge variant="outline">{tx.asset}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {tx.timestamp.toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-semibold">
                    {tx.amount} {tx.asset}
                  </div>
                  <div className="text-sm text-muted-foreground">${tx.valueUSD.toLocaleString()}</div>
                </div>
                <Button size="icon" variant="ghost" asChild>
                  <a
                    href={`https://stellar.expert/explorer/public/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
