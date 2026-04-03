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
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
      <header className="dark sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Desktop Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/avintelligence-wordmark.png"
              alt="AVINTELLIGENCE"
              width={180}
              height={36}
              style={{ width: 'auto', height: '34px' }}
              className="hidden md:block"
              priority
            />
            <Image
              src="/avintelligence-stacked.png"
              alt="AVINT"
              width={32}
              height={40}
              style={{ width: 'auto', height: '36px' }}
              className="md:hidden"
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
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Products
                <ChevronDown className="h-4 w-4" />
              </button>
              {productsOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-border bg-card p-2 shadow-lg">
                  {products.map((product) => (
                    product.external ? (
                      <a
                        key={product.name}
                        href={product.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                        onClick={() => setProductsOpen(false)}
                      >
                        {product.name}
                      </a>
                    ) : (
                      <Link
                        key={product.name}
                        href={product.disabled ? "#" : product.href}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          product.disabled
                            ? "cursor-not-allowed text-muted-foreground"
                            : "text-foreground hover:bg-muted"
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
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Tools
                <ChevronDown className="h-4 w-4" />
              </button>
              {toolsOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-border bg-card p-2 shadow-lg">
                  {tools.map((tool) => (
                    <a
                      key={tool.name}
                      href={tool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
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
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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
          <div className="border-t border-border bg-background px-6 py-4 md:hidden">
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
