import { type Page, type Locator, expect } from '@playwright/test'
import { CategoriesTestIds } from '@/testIds'

export class CategoriesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/categories')
    await this.page.waitForLoadState('networkidle')
  }

  async createRootCategory(name: string) {
    const firstCatButton = this.page.getByTestId(CategoriesTestIds.BtnCreateFirst)
    const newCatButton = this.page.getByTestId(CategoriesTestIds.BtnNew)

    if (await firstCatButton.isVisible()) {
      await firstCatButton.click()
    } else {
      await newCatButton.click()
    }

    const input = this.page.getByTestId(CategoriesTestIds.InputNewName)
    await expect(input).toBeVisible()
    await input.fill(name)
    await input.press('Enter')
    await expect(this.page.getByText(name)).toBeVisible()
  }

  async createSubcategory(parentName: string, childName: string) {
    await this.getCategoryRow(parentName).getByTestId(CategoriesTestIds.BtnAddSubcategory).click()

    const input = this.page.getByTestId(CategoriesTestIds.InputNewName)
    await expect(input).toBeVisible()
    await input.fill(childName)
    await input.press('Enter')
    await expect(this.page.getByText(childName)).toBeVisible()
  }

  async editCategoryName(oldName: string, newName: string) {
    await this.getCategoryRow(oldName).getByTestId(CategoriesTestIds.BtnName).click()

    const input = this.page.getByTestId(CategoriesTestIds.InputName)
    await expect(input).toBeVisible()
    await input.fill(newName)
    await input.press('Enter')
    await expect(this.page.getByText(newName)).toBeVisible()
  }

  async deleteCategory(name: string) {
    await this.getCategoryRow(name).getByTestId(CategoriesTestIds.BtnDelete).click()
    await this.page.getByTestId(CategoriesTestIds.BtnConfirmDelete).click()
    await expect(this.page.getByTestId(CategoriesTestIds.BtnConfirmDelete)).not.toBeVisible({ timeout: 5000 })
  }

  private getCategoryRow(name: string): Locator {
    return this.page.locator(`[data-category-name="${name}"]`)
  }
}
