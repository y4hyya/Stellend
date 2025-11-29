"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface PositionChartProps {
  data: Array<{
    date: string
    collateral: number
    debt: number
  }>
}

export function PositionChart({ data }: PositionChartProps) {
  return (
    <Card className="glass-panel border-white/10">
      <CardHeader>
        <CardTitle>Pozisyon Geçmişi</CardTitle>
        <CardDescription>Son 30 günlük teminat ve borç değerleri</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            collateral: {
              label: "Teminat",
              color: "hsl(var(--chart-1))",
            },
            debt: {
              label: "Borç",
              color: "hsl(var(--chart-2))",
            },
          }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorCollateral" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="collateral"
                stroke="hsl(var(--chart-1))"
                fill="url(#colorCollateral)"
                name="Teminat"
              />
              <Area type="monotone" dataKey="debt" stroke="hsl(var(--chart-2))" fill="url(#colorDebt)" name="Borç" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
