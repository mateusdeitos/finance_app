import { type Page, type Locator, expect } from '@playwright/test'
import { HomeTestIds } from '@/testIds'

export class HomePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(month: number, year: number) {
    await this.page.goto(`/home?month=${month}&year=${year}`)
    await expect(this.page.getByTestId(HomeTestIds.Page)).toBeVisible()
  }

  accountRow(accountId: number): Locator {
    return this.page.getByTestId(HomeTestIds.AccountRow(accountId))
  }

  section(testId: string): Locator {
    return this.page.getByTestId(testId)
  }
}
