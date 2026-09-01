export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$", decimals: 2 },
  { code: "PHP", label: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "EUR", label: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", label: "Pound Sterling", symbol: "£", decimals: 2 },
  { code: "AUD", label: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", decimals: 0 },
] as const

export type SupportedCurrencyCode = typeof SUPPORTED_CURRENCIES[number]["code"]

export function currencyDecimals(code: string): number {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code)?.decimals ?? 2
}
