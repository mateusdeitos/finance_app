// Global teardown runs after all tests complete.
// In CI, the database is wiped between runs, so no cleanup is needed.
// For local dev, test data accumulates — acceptable for now.
async function globalTeardown() {
  console.log('✓ E2E tests complete')
}

export default globalTeardown
