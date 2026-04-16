import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { MarketingScrollReset } from '@/components/marketing-scroll-reset'
import './globals.css'

export const metadata: Metadata = {
  title: 'AVIntelligence — AI Powered file storage and reports generator and analytics',
  description: 'AVINT develops intelligent tools that structure information from real-world documents and workflows. Transform files and activity into structured data for dashboards, reports, and decision-making.',
  icons: {
    icon: '/avint-logo-mark.png',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Aldrich&family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&family=Instrument+Serif:ital,wght@0,400;1,400&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","w6fazqmi2j");`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <MarketingScrollReset />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
