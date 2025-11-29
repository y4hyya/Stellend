"use client"

import Link from "next/link"
import { useState } from "react"

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">P</span>
          </div>
          <span className="font-bold text-xl text-foreground">Peerpool</span>
        </div>

        <div className="hidden md:flex gap-8">
          <Link href="#how" className="text-foreground hover:text-primary transition">
            How it works
          </Link>
          <Link href="#opportunities" className="text-foreground hover:text-primary transition">
            Opportunities
          </Link>
          <Link href="#" className="text-foreground hover:text-primary transition">
            About
          </Link>
        </div>

        <div className="hidden md:flex gap-3">
          <button className="px-4 py-2 text-primary hover:bg-primary/10 rounded-lg transition">Sign in</button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
            Get started
          </button>
        </div>

        <button className="md:hidden text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-4 py-4 space-y-4">
            <Link href="#how" className="block text-foreground">
              How it works
            </Link>
            <Link href="#opportunities" className="block text-foreground">
              Opportunities
            </Link>
            <button className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
