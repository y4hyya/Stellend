import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { WalletProvider } from "@/context/wallet-context"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "StelLend - DeFi Lending Protocol",
  description: "Peer-to-pool lending on Stellar/Soroban",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`font-sans antialiased bg-background text-foreground`} suppressHydrationWarning>
        <WalletProvider>
          {children}
          <Toaster />
          <SonnerToaster />
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  )
}
