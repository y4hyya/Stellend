"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, Shield, Zap, DollarSign, Lock, Users, Loader2 } from "lucide-react"
import { useWallet } from "@/hooks/use-wallet"
import { stellendContractAPI } from "@/services/soroban-service"

interface PlatformMetrics {
  tvl: number
  totalSupplied: number
  totalBorrowed: number
  bestSupplyAPR: number
  bestBorrowAPY: number
  utilization: number
}

export function LandingPage() {
  const router = useRouter()
  const { connectWallet, isConnected } = useWallet()
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  // Auto-navigate to dashboard when wallet connects
  useEffect(() => {
    if (isConnected) {
      router.push("/dashboard")
    }
  }, [isConnected, router])

  useEffect(() => {
    async function loadMetrics() {
      try {
        const markets = await stellendContractAPI.getMarkets()
        
        // Aggregate metrics from all markets
        const totalSupplied = markets.reduce((acc, m) => acc + m.totalSupplied, 0)
        const totalBorrowed = markets.reduce((acc, m) => acc + m.totalBorrowed, 0)
        const tvl = totalSupplied - totalBorrowed
        
        // Find best rates
        const bestSupplyAPR = Math.max(...markets.map(m => m.supplyAPR), 0)
        const bestBorrowAPY = Math.max(...markets.map(m => m.borrowAPY), 0)
        
        // Calculate overall utilization
        const utilization = totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0

        setMetrics({
          tvl,
          totalSupplied,
          totalBorrowed,
          bestSupplyAPR,
          bestBorrowAPY,
          utilization,
        })
      } catch (error) {
        console.error("Error loading platform metrics:", error)
        // Set default values on error
        setMetrics({
          tvl: 0,
          totalSupplied: 0,
          totalBorrowed: 0,
          bestSupplyAPR: 0,
          bestBorrowAPY: 0,
          utilization: 0,
        })
      } finally {
        setLoading(false)
      }
    }

    loadMetrics()
  }, [])

  // Format large numbers
  const formatValue = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`
    } else {
      return `$${value.toFixed(2)}`
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-primary/5">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Powered by Stellar & Soroban</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent leading-tight text-balance">
              Decentralized Lending Protocol on Stellar
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Supply assets to earn interest or use them as collateral to borrow. Powered by Soroban smart contracts for
              speed and security.
            </p>

            <div className="flex justify-center pt-4">
              <button
                onClick={connectWallet}
                className="px-10 py-4 rounded-xl font-semibold text-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/40 hover:shadow-xl hover:shadow-primary/50 hover:scale-105 transition-all duration-300"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Metrics */}
      <section className="py-16 bg-gradient-to-b from-transparent to-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Platform Metrics</h2>
            <p className="text-muted-foreground">Live statistics from the protocol</p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading live data...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glassmorphism border-2 border-primary/30 hover:border-primary/50 transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Total Value Locked</p>
                      <p className="text-2xl font-bold text-primary">{formatValue(metrics?.tvl || 0)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Total value of all assets in the protocol</p>
                </CardContent>
              </Card>

              <Card className="glassmorphism border-2 border-success/30 hover:border-success/50 transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-success" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Total Supplied</p>
                        <p className="text-2xl font-bold text-success">
                          {formatValue(metrics?.totalSupplied || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-border/50 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Best APR</span>
                        <span className="text-lg font-bold text-success">{(metrics?.bestSupplyAPR || 0).toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glassmorphism border-2 border-destructive/30 hover:border-destructive/50 transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-destructive/20 to-destructive/10 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-destructive" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Total Borrowed</p>
                        <p className="text-2xl font-bold text-destructive">
                          {formatValue(metrics?.totalBorrowed || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-border/50 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Best APY</span>
                        <span className="text-lg font-bold text-destructive">{(metrics?.bestBorrowAPY || 0).toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get started in 3 simple steps</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="text-xl font-bold">Connect Wallet</h3>
              <p className="text-muted-foreground">Connect your Stellar wallet securely to start using the protocol</p>
            </div>

            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/10 border-2 border-accent/30">
                <span className="text-2xl font-bold text-accent">2</span>
              </div>
              <h3 className="text-xl font-bold">Supply or Borrow</h3>
              <p className="text-muted-foreground">
                Supply assets to earn interest or use them as collateral to borrow
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-success/20 to-success/10 border-2 border-success/30">
                <span className="text-2xl font-bold text-success">3</span>
              </div>
              <h3 className="text-xl font-bold">Earn & Manage</h3>
              <p className="text-muted-foreground">Track your positions and optimize your returns</p>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Features */}
      <section className="py-16 bg-gradient-to-b from-transparent to-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="glassmorphism border-2 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                  <h3 className="text-2xl font-bold">Security First</h3>
                </div>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Powered by Soroban smart contracts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Built on Stellar's fast and secure network</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Transparent and auditable on-chain logic</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="glassmorphism border-2 border-accent/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-8 h-8 text-accent" />
                  <h3 className="text-2xl font-bold">Protocol Stats</h3>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Total Value Locked</span>
                      <span className="text-lg font-bold text-primary">{formatValue(metrics?.tvl || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Total Supplied</span>
                      <span className="text-lg font-bold text-success">{formatValue(metrics?.totalSupplied || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Total Borrowed</span>
                      <span className="text-lg font-bold text-accent">{formatValue(metrics?.totalBorrowed || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Pool Utilization</span>
                      <span className="text-lg font-bold">{(metrics?.utilization || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Best Supply APR</span>
                      <span className="text-lg font-bold text-green-500">{(metrics?.bestSupplyAPR || 0).toFixed(2)}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
