import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import Script from 'next/script'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'AVINTELLIGENCE - Applied Intelligence for Real-World Systems',
  description: 'AVINT develops intelligent tools that structure information from real-world documents and workflows. Transform files and activity into structured data for dashboards, reports, and decision-making.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/avint-logo-mark.png',
        type: 'image/png',
      },
    ],
    apple: '/avint-logo-mark.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script async src="https://www.googletagmanager.com/gtag/js?id=AW-18059365303" strategy="afterInteractive" />
        <Script id="google-ads" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-18059365303');
        `}</Script>
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
