export type ReviewVerdict = "matched" | "partial" | "wrong"

export const REVIEW_VERDICTS = ["matched", "partial", "wrong"] as const

export function shouldDiagnose(diagnosedAt: string | null | undefined, force: boolean): boolean {
  return force || !diagnosedAt
}

export function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return typeof value === "string" && REVIEW_VERDICTS.includes(value as ReviewVerdict)
}
