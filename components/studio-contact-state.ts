export function getStudioContactState(bookingUrl: string | undefined) {
  const bookingAvailable = (() => {
    try {
      return Boolean(bookingUrl?.trim() && new URL(bookingUrl).pathname.replace(/^\/+|\/+$/g, ""))
    } catch {
      return false
    }
  })()
  return { bookingAvailable, showForm: !bookingAvailable }
}
