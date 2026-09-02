"use client"

import { useState } from "react"
import { CalBookingLink } from "@/components/cal-booking"
import { StudioInquiryForm } from "@/components/studio-inquiry-form"
import { getStudioContactState } from "@/components/studio-contact-state"

const initialState = getStudioContactState(process.env.NEXT_PUBLIC_CALCOM_BOOKING_URL)

export function StudioContactSection() {
  const [bookingAvailable, setBookingAvailable] = useState(initialState.bookingAvailable)
  const [showForm, setShowForm] = useState(initialState.showForm)

  function showFallback() {
    setBookingAvailable(false)
    setShowForm(true)
  }

  return <div className="relative mx-auto max-w-4xl">
    <div className="glass-surface rounded-3xl p-8 text-center md:p-12">
      <p className="text-sm font-medium uppercase tracking-wider text-primary">Have something you want built?</p>
      {bookingAvailable ? <div className="mt-8 flex flex-col items-center gap-4">
        <CalBookingLink onUnavailable={showFallback} className="border-primary bg-primary px-6 py-3 text-base text-primary-foreground hover:bg-primary/90" />
        {!showForm ? <button type="button" onClick={() => setShowForm(true)} className="text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">Not ready for a call? Send a message instead</button> : null}
      </div> : null}
      {showForm ? <div className="mt-8"><StudioInquiryForm /></div> : null}
    </div>
  </div>
}
