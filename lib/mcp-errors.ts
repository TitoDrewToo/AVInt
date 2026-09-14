/** Errors whose message is safe and actionable for an MCP caller. */
export class McpUserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
