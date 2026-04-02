import { type Page, type Locator, expect } from '@playwright/test'

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
    const firstCatButton = this.page.getByTestId('btn_create_first_category')
    const newCatButton = this.page.getByTestId('btn_new_category')

    if (await firstCatButton.isVisible()) {
      await firstCatButton.click()
    } else {
      await newCatButton.click()
    }

    const input = this.page.getByTestId('input_new_category_name')
    await expect(input).toBeVisible()
    await input.fill(name)
    await input.press('Enter')
    await expect(this.page.getByText(name)).toBeVisible()
  }

  async createSubcategory(parentName: string, childName: string) {
    await this.getCategoryRow(parentName).getByTestId('btn_add_subcategory').click()

    const input = this.page.getByTestId('input_new_category_name')
    await expect(input).toBeVisible()
    await input.fill(childName)
    await input.press('Enter')
    await expect(this.page.getByText(childName)).toBeVisible()
  }

  async editCategoryName(oldName: string, newName: string) {
    await this.getCategoryRow(oldName).getByTestId('btn_category_name').click()

    const input = this.page.getByTestId('input_category_name')
    await expect(input).toBeVisible()
    await input.fill(newName)
    await input.press('Enter')
    await expect(this.page.getByText(newName)).toBeVisible()
  }

  async deleteCategory(name: string) {
    await this.getCategoryRow(name).getByTestId('btn_category_delete').click()
    await this.page.getByTestId('btn_confirm_delete_category').click()
    await expect(this.page.getByTestId('btn_confirm_delete_category')).not.toBeVisible({ timeout: 5000 })
  }

  private getCategoryRow(name: string): Locator {
    return this.page.locator(`[data-category-name="${name}"]`)
  }
}
