export interface GuardrailOptions {
  allowInProduction?: boolean;
}

let warned = false;

/**
 * Blocks chaos scenarios when NODE_ENV=production unless explicitly overridden.
 * See docs/PRD.md "Riscos" — an activated scenario leaking to prod breaks real clients.
 */
export function isBlockedByGuardrail(options: GuardrailOptions = {}): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction || options.allowInProduction) return false;

  if (!warned) {
    warned = true;
    console.warn(
      "[chaos-api] NODE_ENV=production detected — chaos scenarios disabled. " +
        "Pass { allowInProduction: true } to chaos() to override (not recommended).",
    );
  }
  return true;
}

/** Test-only: resets the one-time warning so guardrail tests can assert on it repeatedly. */
export function resetGuardrailWarning(): void {
  warned = false;
}
