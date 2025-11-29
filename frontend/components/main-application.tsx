"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { LandingPage } from "@/components/landing-page"
import { InfoPage } from "@/components/info-page"
import Navbar from "@/components/navbar"
import DashboardPage from "@/pages/dashboard"
import CollateralPage from "@/pages/collateral"
import BorrowRepayPage from "@/pages/borrow-repay"
import LendWithdrawPage from "@/pages/lend-withdraw"
import { LayoutDashboard, Shield, TrendingDown, TrendingUp, BookOpen } from "lucide-react"

export function MainApplication() {
  const { isConnected } = useWallet()
  const [currentPage, setCurrentPage] = useState<
    "landing" | "info" | "dashboard" | "collateral" | "borrow" | "lend" | "learn"
  >("landing")
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "collateral", label: "Collateral", icon: Shield },
    { id: "borrow", label: "Borrow", icon: TrendingDown },
    { id: "lend", label: "Lend", icon: TrendingUp },
    { id: "learn", label: "Learn", icon: BookOpen },
  ]

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <>
        <Navbar onLearnMore={() => setCurrentPage("info")} />
        {currentPage === "info" ? (
          <InfoPage onBack={() => setCurrentPage("landing")} />
        ) : (
          <LandingPage onLearnMore={() => setCurrentPage("info")} />
        )}
      </>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="w-64 glass-panel border-r border-white/10 p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold gradient-text">StelLend</h2>
        </div>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  currentPage === item.id ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Navbar />
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "collateral" && <CollateralPage />}
        {currentPage === "borrow" && <BorrowRepayPage />}
        {currentPage === "lend" && <LendWithdrawPage />}
        {currentPage === "learn" && <InfoPage onBack={() => setCurrentPage("dashboard")} />}
      </div>
    </div>
  )
}
