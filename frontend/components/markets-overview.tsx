"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { MarketAsset } from "@/types/dashboard"

interface MarketsOverviewProps {
  markets: MarketAsset[]
}

export function MarketsOverview({ markets }: MarketsOverviewProps) {
  return (
    <Card className="glass-panel border-white/10">
      <CardHeader>
        <CardTitle>Piyasalar</CardTitle>
        <CardDescription>Tüm varlıkların durumu ve oranları</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4">Varlık</th>
                <th className="text-right py-3 px-4">Toplam Arz</th>
                <th className="text-right py-3 px-4">Toplam Borç</th>
                <th className="text-right py-3 px-4">Arz APR</th>
                <th className="text-right py-3 px-4">Borç APY</th>
                <th className="text-right py-3 px-4">Kullanım</th>
                <th className="text-right py-3 px-4">Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((market) => (
                <tr key={market.asset} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <span className="text-sm font-bold">{market.icon}</span>
                      </div>
                      <span className="font-semibold">{market.asset}</span>
                    </div>
                  </td>
                  <td className="text-right py-4 px-4">${market.totalSupplied.toLocaleString()}</td>
                  <td className="text-right py-4 px-4">${market.totalBorrowed.toLocaleString()}</td>
                  <td className="text-right py-4 px-4">
                    <Badge variant="outline" className="bg-green-500/10 text-green-500">
                      {market.supplyAPR.toFixed(2)}%
                    </Badge>
                  </td>
                  <td className="text-right py-4 px-4">
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-500">
                      {market.borrowAPY.toFixed(2)}%
                    </Badge>
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className={market.utilization > 80 ? "text-red-500" : "text-green-500"}>
                      {market.utilization.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-4 px-4">
                    <div>
                      <div className="font-semibold">${market.price.toFixed(2)}</div>
                      <div
                        className={`text-sm flex items-center justify-end gap-1 ${
                          market.priceChange24h >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {market.priceChange24h >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {Math.abs(market.priceChange24h).toFixed(2)}%
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
