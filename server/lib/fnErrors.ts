/**
 * Error types for the /api/fn cloud-function replacements.
 *
 * FnError carries the HTTP status and the exact message the client is shown, so
 * upstream detail never reaches the browser.
 */

export class FnError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "FnError";
  }
}
