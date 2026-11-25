import { request, test as base, type Page } from '@playwright/test'
import { WEB_URL } from '../env'
import { ApiUser } from './api'
import { createLab, secondsToMidnight, type Lab, type LabUser } from './lab'

interface Fixtures {
  /** Laboratório novo, só deste teste. */
  lab: Lab
  /** A API com a sessão de um usuário, sem navegador. */
  apiAs: (user: LabUser, lab?: Lab) => Promise<ApiUser>
  /** Põe a sessão de um usuário no navegador do teste e abre o endereço. */
  openAs: (user: LabUser, path?: string) => Promise<Page>
  /** Fixa (ou solta, com null) o relógio do servidor para este navegador. */
  setServerNow: (instant: string | null) => Promise<void>
}

// Um teste não pode atravessar a meia-noite: "hoje" mudaria no meio.
const MIDNIGHT_MARGIN_S = 90

let ipCount = 0

export const test = base.extend<Fixtures>({
  // Um IP por teste: o limite de 20 logins errados por IP não vaza entre testes.
  extraHTTPHeaders: async ({}, use, testInfo) => {
    ipCount += 1
    await use({ 'X-Forwarded-For': `10.${testInfo.workerIndex % 256}.${ipCount >> 8}.${ipCount & 255}` })
  },

  lab: async ({}, use, testInfo) => {
    const left = secondsToMidnight()
    if (left < MIDNIGHT_MARGIN_S) {
      testInfo.setTimeout(testInfo.timeout + (left + 1) * 1000)
      await new Promise((resolve) => setTimeout(resolve, (left + 1) * 1000))
    }
    await use(await createLab())
  },

  apiAs: async ({ lab, extraHTTPHeaders }, use) => {
    const opened: ApiUser[] = []
    await use(async (user, userLab = lab) => {
      const context = await request.newContext({ baseURL: WEB_URL, extraHTTPHeaders })
      const api = new ApiUser(context, userLab)
      opened.push(api)
      await api.login(user)
      return api
    })
    await Promise.all(opened.map((api) => api.request.dispose()))
  },

  openAs: async ({ page, lab }, use) => {
    await use(async (user, path = '/hoje') => {
      await new ApiUser(page.request, lab).login(user)
      await page.goto(path)
      return page
    })
  },

  setServerNow: async ({ context, extraHTTPHeaders }, use) => {
    await use(async (instant) => {
      await context.setExtraHTTPHeaders({ ...extraHTTPHeaders, ...(instant ? { 'X-E2E-Now': instant } : {}) })
    })
  },
})

export { expect } from '@playwright/test'
