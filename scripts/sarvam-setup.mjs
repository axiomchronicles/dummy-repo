/** All outbound calls must use the authenticated, consent-gated application service. */
process.stderr.write(
  'Use the app review drawer to prepare and explicitly confirm a single call. Standalone provider dialing is disabled because it bypasses consent, idempotency and the audit trail. See /agents for safe provider diagnostics.\n',
);
process.exitCode = 1;
