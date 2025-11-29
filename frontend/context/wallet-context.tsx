"use client"

import type React from "react"
import { createContext, useCallback, useState } from "react"

interface WalletContextType {
  publicKey: string | null
  isConnected: boolean
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  error: string | null
}

export const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  isConnected: false,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  error: null,
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connectWallet = useCallback(async () => {
    try {
      setError(null)
      // Simulate wallet connection - in production would use @stellar/freighter-api
      // For demo purposes, generate a mock address
      const mockAddress = `GABC${Math.random().toString(36).substring(2, 15).toUpperCase()}XYZ`
      setPublicKey(mockAddress)
      setIsConnected(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet"
      setError(message)
      console.error("Wallet connection error:", err)
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    setPublicKey(null)
    setIsConnected(false)
    setError(null)
  }, [])

  return (
    <WalletContext.Provider value={{ publicKey, isConnected, connectWallet, disconnectWallet, error }}>
      {children}
    </WalletContext.Provider>
  )
}
