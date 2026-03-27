import { type Page, type Locator, expect } from '@playwright/test'

export class CategoriesPage {
  readonly page: Page
  readonly heading: Locator
  readonly newCategoryButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.locator('p, h1, h2').filter({ hasText: /^Categorias$/ }).first()
    this.newCategoryButton = page.getByRole('button', { name: 'Nova Categoria' })
  }

  async goto() {
    await this.page.goto('/categories')
    // The page title is a <p> (Mantine Text), not a heading
    await this.page.locator('p').filter({ hasText: /^Categorias$/ }).first().waitFor()
    await this.page.waitForLoadState('networkidle')
  }

  /** Create a root category using the inline input at the end of the tree. */
  async createRootCategory(name: string) {
    const isEmpty = await this.page.getByRole('button', { name: 'Criar primeira categoria' }).isVisible()
    if (isEmpty) {
      await this.page.getByRole('button', { name: 'Criar primeira categoria' }).click()
    } else {
      await this.newCategoryButton.click()
    }

    const input = this.page.getByPlaceholder('Nome da categoria')
    await expect(input).toBeVisible()
    await input.fill(name)
    await input.press('Enter')
    await expect(this.page.getByText(name)).toBeVisible()
  }

  /** Create a subcategory under an existing parent. */
  async createSubcategory(parentName: string, childName: string) {
    const parentRow = this.getCategoryRow(parentName)
    // For root categories (depth=0), add-child (+) is the LAST button.
    // Delete is second-to-last. Try aria-label first, then fall back to last button.
    await parentRow.locator('button[aria-label*="subcategoria"], button[title*="subcategoria"]').click().catch(async () => {
      await parentRow.getByRole('button').last().click()
    })

    const input = this.page.getByPlaceholder('Nome da categoria')
    await expect(input).toBeVisible()
    await input.fill(childName)
    await input.press('Enter')
    await expect(this.page.getByText(childName)).toBeVisible()
  }

  /** Click the category name text to enter inline edit mode, then save. */
  async editCategoryName(oldName: string, newName: string) {
    const nameText = this.page.getByText(oldName, { exact: true })
    await nameText.click()

    const input = this.page.locator('input[value]').filter({ hasText: '' }).or(
      this.page.locator(`input[value="${oldName}"]`)
    )
    await expect(input).toBeVisible()
    await input.fill(newName)
    await input.press('Enter')
    await expect(this.page.getByText(newName)).toBeVisible()
  }

  /** Click the delete button for a category and confirm in the modal. */
  async deleteCategory(name: string) {
    const row = this.getCategoryRow(name)
    const buttons = row.getByRole('button')
    const count = await buttons.count()

    // Root categories (depth=0) have an extra add-child button as the LAST button.
    // Delete is last for child categories and second-to-last for root categories.
    // Try from the end until a confirm dialog appears.
    for (let i = count - 1; i >= Math.max(0, count - 2); i--) {
      await buttons.nth(i).click()
      const modal = this.page.getByRole('dialog')
      if (await modal.isVisible()) {
        await modal.getByRole('button', { name: 'Excluir' }).click()
        await expect(modal).not.toBeVisible({ timeout: 5000 })
        return
      }
      // Dismiss any inline input that appeared (add-child button was clicked)
      await this.page.keyboard.press('Escape')
    }
    throw new Error(`Could not find delete button for category: ${name}`)
  }

  async getCategoryNames(): Promise<string[]> {
    await this.page.waitForLoadState('networkidle')
    // Category names are rendered as text nodes in the tree rows
    const nameElements = this.page.locator('[data-category-name], [class*="CategoryCard"] span').filter({ hasNotText: /^\s*$/ })
    const count = await nameElements.count()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await nameElements.nth(i).textContent()
      if (text?.trim()) names.push(text.trim())
    }
    return names
  }

  private getCategoryRow(name: string): Locator {
    return this.page.locator('[class*="Group"]').filter({ hasText: name }).first()
  }
}
