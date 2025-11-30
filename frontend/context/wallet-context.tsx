"use client"

import type React from "react"
import { createContext, useCallback, useState, useEffect } from "react"
import {
  isConnected as freighterIsConnected,
  isAllowed,
  setAllowed,
  getPublicKey,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api"

// Network configuration - TESTNET
export const NETWORK = {
  name: "TESTNET",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
}

interface WalletContextType {
  publicKey: string | null
  isConnected: boolean
  isFreighterInstalled: boolean
  network: string | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  signTx: (xdr: string) => Promise<string>
  error: string | null
  isLoading: boolean
}

export const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  isConnected: false,
  isFreighterInstalled: false,
  network: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  signTx: async () => "",
  error: null,
  isLoading: false,
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false)
  const [network, setNetwork] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check if Freighter is installed and if already connected
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        // Check if Freighter extension is installed
        const connected = await freighterIsConnected()
        setIsFreighterInstalled(connected)

        if (connected) {
          // Check if already allowed
          const allowed = await isAllowed()
          if (allowed) {
            // Get stored address
            const address = await getPublicKey()
            if (address) {
              setPublicKey(address)
              setIsConnected(true)

              // Get network
              const networkName = await getNetwork()
              setNetwork(networkName || null)
            }
          }
        }
      } catch (err) {
        console.error("Error checking Freighter:", err)
      }
    }

    checkFreighter()
  }, [])

  const connectWallet = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if Freighter is installed
      const connected = await freighterIsConnected()
      if (!connected) {
        throw new Error("Freighter wallet is not installed. Please install the Freighter browser extension.")
      }

      // Request access
      const allowed = await setAllowed()
      if (!allowed) {
        throw new Error("User denied access to Freighter wallet")
      }

      // Get address
      const address = await getPublicKey()
      if (!address) {
        throw new Error("Failed to get wallet address")
      }

      setPublicKey(address)
      setIsConnected(true)

      // Get network
      const networkName = await getNetwork()
      setNetwork(networkName || null)

      // Warn if not on Testnet
      if (networkName && networkName !== "TESTNET") {
        console.warn(`Warning: Connected to ${networkName}. Please switch to TESTNET for Apogee.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet"
      setError(message)
      console.error("Wallet connection error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    setPublicKey(null)
    setIsConnected(false)
    setNetwork(null)
    setError(null)
  }, [])

  const signTx = useCallback(async (xdr: string): Promise<string> => {
    if (!isConnected || !publicKey) {
      throw new Error("Wallet not connected")
    }

    try {
      console.log("Signing transaction with Freighter...")
      console.log("Network:", NETWORK.networkPassphrase)
      console.log("Account:", publicKey)
      
      const signedXdr = await signTransaction(xdr, {
        networkPassphrase: NETWORK.networkPassphrase,
        accountToSign: publicKey,
      })

      console.log("Freighter response:", signedXdr ? "Signed successfully" : "No response")

      if (!signedXdr) {
        throw new Error("Freighter returned empty response - transaction may have been rejected")
      }

      return signedXdr
    } catch (err: any) {
      console.error("Sign transaction error:", err)
      
      // Better error messages
      let message = "Failed to sign transaction"
      
      if (err.message?.includes("User declined")) {
        message = "Transaction rejected by user"
      } else if (err.message?.includes("Wallet is locked")) {
        message = "Please unlock Freighter wallet"
      } else if (err.message?.includes("network")) {
        message = "Network mismatch - ensure Freighter is on Testnet"
      } else if (err instanceof Error) {
        message = err.message
      }
      
      throw new Error(message)
    }
  }, [isConnected, publicKey])

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        isConnected,
        isFreighterInstalled,
        network,
        connectWallet,
        disconnectWallet,
        signTx,
        error,
        isLoading,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
