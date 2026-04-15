"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { useTheme } from "next-themes"
import { ChevronDown, Menu, X, Sun, Moon, User } from "lucide-react"
import { AccountPanel } from "@/components/account-panel"
import { SystemStatusIndicator } from "@/components/ui/system-status-indicator"

const products = [
  { name: "PicklePal", href: "https://picklepalph.com", external: true },
  { name: "Hooper", href: "#", disabled: true },
  { name: "Smart Storage", href: "/products/smart-storage" },
  { name: "Smart Dashboard", href: "/products/smart-dashboard" },
]

const tools = [
  { name: "Smart Storage", href: "/tools/smart-storage" },
  { name: "Smart Dashboard", href: "/tools/smart-dashboard" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  )
}

function AccountMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
      aria-label="Open account menu"
    >
      <User className="h-4 w-4" />
    </button>
  )
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 w-full px-4 pt-4">
        <nav className="glass-surface mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-3">
          {/* Desktop Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/avintelligence-wordmark.png"
              alt="AVINTELLIGENCE"
              width={180}
              height={36}
              style={{ width: 'auto', height: '34px' }}
              className="hidden brightness-0 md:block dark:brightness-100"
              priority
            />
            <Image
              src="/avintelligence-stacked.png"
              alt="AVINT"
              width={32}
              height={40}
              style={{ width: 'auto', height: '36px' }}
              className="brightness-0 md:hidden dark:brightness-100"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-6 md:flex">
            {/* Products Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setProductsOpen(!productsOpen)
                  setToolsOpen(false)
                }}
                className="flex items-center gap-1 font-sans text-sm font-medium text-foreground/75 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              >
                Products
                <ChevronDown className="h-4 w-4" />
              </button>
              {productsOpen && (
                <div className="glass-surface absolute left-0 top-full mt-3 w-48 rounded-xl p-2">
                  {products.map((product) => (
                    product.external ? (
                      <a
                        key={product.name}
                        href={product.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg px-3 py-2 font-sans text-sm text-foreground/80 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
                        onClick={() => setProductsOpen(false)}
                      >
                        {product.name}
                      </a>
                    ) : (
                      <Link
                        key={product.name}
                        href={product.disabled ? "#" : product.href}
                        className={`block rounded-lg px-3 py-2 font-sans text-sm transition-all ${
                          product.disabled
                            ? "cursor-not-allowed text-muted-foreground"
                            : "text-foreground/80 hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
                        }`}
                        onClick={() => setProductsOpen(false)}
                      >
                        {product.name}
                      </Link>
                    )
                  ))}
                </div>
              )}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setToolsOpen(!toolsOpen)
                  setProductsOpen(false)
                }}
                className="flex items-center gap-1 font-sans text-sm font-medium text-foreground/75 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              >
                Tools
                <ChevronDown className="h-4 w-4" />
              </button>
              {toolsOpen && (
                <div className="glass-surface absolute left-0 top-full mt-3 w-48 rounded-xl p-2">
                  {tools.map((tool) => (
                    <a
                      key={tool.name}
                      href={tool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg px-3 py-2 font-sans text-sm text-foreground/80 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
                      onClick={() => setToolsOpen(false)}
                    >
                      {tool.name}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/pricing"
              className="font-sans text-sm font-medium text-foreground/75 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              Pricing
            </Link>

            <ThemeToggle />

            <SystemStatusIndicator />

            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
          </div>

          {/* Mobile Right Side */}
          <div className="flex items-center gap-3 md:hidden">
            <ThemeToggle />
            <SystemStatusIndicator />
            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 text-foreground" />
              ) : (
                <Menu className="h-6 w-6 text-foreground" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="glass-surface mx-4 mt-2 rounded-2xl px-6 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Products
                </span>
                {products.map((product) => (
                  product.external ? (
                    <a
                      key={product.name}
                      href={product.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {product.name}
                    </a>
                  ) : (
                    <Link
                      key={product.name}
                      href={product.disabled ? "#" : product.href}
                      className={`text-sm ${
                        product.disabled ? "text-muted-foreground" : "text-foreground"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {product.name}
                    </Link>
                  )
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tools
                </span>
                {tools.map((tool) => (
                  <a
                    key={tool.name}
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {tool.name}
                  </a>
                ))}
              </div>
              <Link
                href="/pricing"
                className="text-sm text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </Link>
            </div>
          </div>
        )}
      </header>

      <AccountPanel
        isOpen={accountPanelOpen}
        onClose={() => setAccountPanelOpen(false)}
      />
    </>
  )
}
