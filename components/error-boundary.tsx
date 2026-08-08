"use client"

import React from "react"

import { captureError } from "@/lib/client-error-capture"

type Props = { children: React.ReactNode }
type State = { hasError: boolean }

export class ErrorMonitoringBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError("AVIntelligence", "react", "render", error, {
      component_stack: info.componentStack,
    })
  }

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError)
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError)
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection)
  }

  private handleWindowError = (event: ErrorEvent) => {
    captureError("AVIntelligence", "window", "error", event.error ?? event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    captureError("AVIntelligence", "window", "unhandledrejection", event.reason)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 text-center">
          <div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">Please refresh and try again.</p>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
