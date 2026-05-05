import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:8080'
const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'storageState.json')
const TEST_USER_EMAIL = 'e2e-test@financeapp.local'

async function globalSetup() {
  // Call test-login endpoint to get a JWT cookie
  const response = await fetch(`${BACKEND_URL}/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER_EMAIL }),
  })

  if (!response.ok) {
    throw new Error(
      `Test login failed: ${response.status} ${response.statusText}. ` +
      'Make sure the backend is running with ENV != production.',
    )
  }

  // Extract auth_token cookie from Set-Cookie header
  const setCookieHeader = response.headers.get('set-cookie')
  if (!setCookieHeader) {
    throw new Error('No Set-Cookie header in test-login response')
  }

  // Parse the cookie value
  const cookieMatch = setCookieHeader.match(/auth_token=([^;]+)/)
  if (!cookieMatch) {
    throw new Error('Could not find auth_token in Set-Cookie header')
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
  const url = new URL(baseURL)

  // Write storage state with the auth cookie
  const storageState = {
    cookies: [
      {
        name: 'auth_token',
        value: cookieMatch[1],
        domain: url.hostname,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  }

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true })
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))

  // Auto-complete onboarding so the user isn't redirected to /onboarding
  const token = cookieMatch[1]
  await fetch(`${BACKEND_URL}/api/onboarding/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ accounts: [], categories: [] }),
  }).catch(() => {
    /* ignore if already completed */
  })

  console.log(`✓ Test user authenticated: ${TEST_USER_EMAIL}`)

  // Verify the cookie works by launching a browser and navigating to a protected route
  const browser = await chromium.launch()
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH })
  const page = await context.newPage()
  await page.goto(`${baseURL}/transactions`)
  await page.waitForLoadState('networkidle')

  const loginRedirected = page.url().includes('/login')
  await browser.close()

  if (loginRedirected) {
    throw new Error('Auth cookie did not work — redirected to login page')
  }

  console.log('✓ Auth verified: protected route accessible')
}

export default globalSetup
