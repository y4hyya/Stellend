"use client"

import { useContext } from "react"
import { WalletContext } from "@/context/wallet-context"

export function useWallet() {
  return useContext(WalletContext)
}
