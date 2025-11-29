export function formatAddress(address: string | null): string {
  if (!address) return ""
  if (address.length <= 8) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPercent(num: number): string {
  return `${(num * 100).toFixed(2)}%`
}
