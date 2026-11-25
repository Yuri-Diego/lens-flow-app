import { defineConfig, devices } from '@playwright/test'
import { API_PORT, API_URL, TEST_JWT_SECRET, TEST_PASSWORD, TIME_ZONE, WEB_PORT, WEB_URL } from './env'

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  // Sem novas tentativas: teste instável tem que aparecer.
  retries: 0,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: TIME_ZONE,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // A API (banco em memória) e o build do site, em portas próprias. Se uma delas
  // estiver ocupada, a execução para em vez de usar o que já está no ar.
  webServer: [
    {
      name: 'api',
      command: 'npm run start:e2e',
      cwd: '../lens-flow-backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_ORIGIN: WEB_URL,
        E2E_JWT_SECRET: TEST_JWT_SECRET,
        E2E_PASSWORD: TEST_PASSWORD,
      },
    },
    {
      name: 'web',
      command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '../lens-flow-web',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { LENS_FLOW_API_PORT: String(API_PORT) },
    },
  ],
})
