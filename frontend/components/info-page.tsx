"use client"

import { ArrowLeft, Shield, TrendingUp, Users, AlertTriangle, Zap } from "lucide-react"

interface InfoPageProps {
  onBack: () => void
}

export function InfoPage({ onBack }: InfoPageProps) {
  return (
    <main className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-background via-background/95 to-primary/3">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        <div className="space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-lg blur opacity-75 animate-pulse" />
                <div className="relative w-16 h-16 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Zap className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Welcome to StelLend
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              A decentralized peer-to-pool lending protocol built on Stellar and powered by Soroban smart contracts
            </p>
          </div>

          {/* What is StelLend */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border border-border/50">
            <h2 className="text-2xl font-bold mb-4">What is StelLend?</h2>
            <p className="text-muted-foreground leading-relaxed">
              StelLend is a decentralized lending protocol that allows users to supply assets to earn interest and
              borrow assets by providing collateral. Built on the Stellar blockchain, StelLend leverages Soroban smart
              contracts to provide a secure, transparent, and efficient lending experience.
            </p>
          </div>

          {/* Key Features */}
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center">Key Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Earn Interest</h3>
                <p className="text-sm text-muted-foreground">
                  Supply your assets to the lending pool and earn competitive interest rates based on market demand.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
                <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Borrow Assets</h3>
                <p className="text-sm text-muted-foreground">
                  Borrow assets by providing collateral, with flexible repayment options and transparent fees.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
                <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Secure & Transparent</h3>
                <p className="text-sm text-muted-foreground">
                  Built on Stellar with Soroban smart contracts, ensuring security, transparency, and low fees.
                </p>
              </div>
            </div>
          </div>

          {/* Key Concepts */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Key Concepts</h2>
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border border-border/50">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-primary" />
                  Health Factor
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  The Health Factor represents the safety of your borrowing position. It's calculated as (Collateral
                  Value × Liquidation Threshold) ÷ Borrowed Value. A Health Factor below 1.0 means your position can be
                  liquidated. Keep it above 1.5 for safety.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border border-border/50">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent" />
                  Collateral Factor
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  The Collateral Factor (typically 80%) determines how much you can borrow against your collateral. For
                  example, with an 80% collateral factor, $1000 in collateral allows you to borrow up to $800.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border border-border/50">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  APR & APY
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  APR (Annual Percentage Rate) is the interest rate you earn by supplying assets. APY (Annual Percentage
                  Yield) is the interest rate you pay when borrowing. Both rates are variable and adjust based on supply
                  and demand in the protocol.
                </p>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20">
            <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-2xl font-bold text-primary">
                  1
                </div>
                <h3 className="font-semibold text-lg">Connect Wallet</h3>
                <p className="text-sm text-muted-foreground">Connect your Stellar wallet to start using the platform</p>
              </div>

              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto text-2xl font-bold text-accent">
                  2
                </div>
                <h3 className="font-semibold text-lg">Supply or Borrow</h3>
                <p className="text-sm text-muted-foreground">
                  Supply assets to earn interest or provide collateral to borrow
                </p>
              </div>

              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto text-2xl font-bold text-green-500">
                  3
                </div>
                <h3 className="font-semibold text-lg">Manage Position</h3>
                <p className="text-sm text-muted-foreground">
                  Monitor your health factor and manage your positions safely
                </p>
              </div>
            </div>
          </div>

          {/* Why Stellar */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border border-border/50">
            <h2 className="text-2xl font-bold mb-4">Why Stellar & Soroban?</h2>
            <div className="space-y-3 text-muted-foreground">
              <div className="flex gap-3">
                <div className="text-primary mt-1">✓</div>
                <p>
                  <strong>Low Fees:</strong> Transaction costs are minimal on Stellar, making lending accessible to
                  everyone
                </p>
              </div>
              <div className="flex gap-3">
                <div className="text-primary mt-1">✓</div>
                <p>
                  <strong>Fast Transactions:</strong> Settle transactions in 3-5 seconds with Stellar's consensus
                  protocol
                </p>
              </div>
              <div className="flex gap-3">
                <div className="text-primary mt-1">✓</div>
                <p>
                  <strong>Smart Contracts:</strong> Soroban provides secure and efficient smart contract execution
                </p>
              </div>
              <div className="flex gap-3">
                <div className="text-primary mt-1">✓</div>
                <p>
                  <strong>Decentralized:</strong> No central authority controls your assets or lending positions
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center p-8 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-6">Connect your wallet and start earning or borrowing today</p>
            <button
              onClick={onBack}
              className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
