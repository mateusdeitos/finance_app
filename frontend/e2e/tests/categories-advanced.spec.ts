import { test, expect } from '@playwright/test'
import { CategoriesPage } from '../pages/CategoriesPage'
import { apiCreateCategory, apiDeleteCategory } from '../helpers/api'

test.describe('Categories Advanced', () => {
  let categoriesPage: CategoriesPage
  const createdIds: number[] = []

  test.beforeEach(async ({ page }) => {
    categoriesPage = new CategoriesPage(page)
    await categoriesPage.goto()
  })

  test.afterAll(async () => {
    for (const id of [...createdIds].reverse()) {
      await apiDeleteCategory(id).catch(() => undefined)
    }
  })

  // ── Delete with replacement ───────────────────────────────────────────────
  test('delete category with replacement preserves replacement category', async ({ page }) => {
    const catToDelete = `Cat Deletar Replace ${Date.now()}`
    const catReplacement = `Cat Substituta ${Date.now()}`

    const deleteMe = await apiCreateCategory({ name: catToDelete })
    const replacement = await apiCreateCategory({ name: catReplacement })
    createdIds.push(replacement.id) // deleteMe is deleted in the test, replacement stays

    await categoriesPage.goto()
    await expect(page.getByText(catToDelete)).toBeVisible()
    await expect(page.getByText(catReplacement)).toBeVisible()

    // Open delete dialog for catToDelete
    await page.locator(`[data-category-name="${catToDelete}"]`).getByTestId('btn_category_delete').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).toBeVisible()

    // Select replacement category
    const replaceSelect = page.getByTestId('select_replace_category')
    await replaceSelect.click()
    await replaceSelect.fill(catReplacement)
    await page.getByRole('option', { name: catReplacement }).click()

    // Confirm deletion
    await page.getByTestId('btn_confirm_delete_category').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).not.toBeVisible({ timeout: 5000 })

    // Deleted category is gone, replacement still present
    await expect(page.getByText(catToDelete)).not.toBeVisible()
    await expect(page.getByText(catReplacement)).toBeVisible()
  })

  // ── Delete without replacement ────────────────────────────────────────────
  test('delete category without replacement removes only that category', async ({ page }) => {
    const catToKeep = `Cat Manter ${Date.now()}`
    const catToDelete = `Cat Deletar Sem Subs ${Date.now()}`

    const keep = await apiCreateCategory({ name: catToKeep })
    const deleteMe = await apiCreateCategory({ name: catToDelete })
    createdIds.push(keep.id)
    // deleteMe will be deleted via UI

    await categoriesPage.goto()
    await expect(page.getByText(catToKeep)).toBeVisible()
    await expect(page.getByText(catToDelete)).toBeVisible()

    // Delete catToDelete without replacement
    await page.locator(`[data-category-name="${catToDelete}"]`).getByTestId('btn_category_delete').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).toBeVisible()
    await page.getByTestId('btn_confirm_delete_category').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).not.toBeVisible({ timeout: 5000 })

    // Deleted category gone, other category still present
    await expect(page.getByText(catToDelete)).not.toBeVisible()
    await expect(page.getByText(catToKeep)).toBeVisible()
  })

  // ── Delete parent with children ───────────────────────────────────────────
  test('subcategory can be deleted independently from parent', async ({ page }) => {
    const parentName = `Parent AdvDel ${Date.now()}`
    const childName = `Child AdvDel ${Date.now()}`

    const parent = await apiCreateCategory({ name: parentName })
    const child = await apiCreateCategory({ name: childName, parent_id: parent.id })
    createdIds.push(parent.id) // parent stays; child gets deleted

    await categoriesPage.goto()
    await expect(page.getByText(parentName)).toBeVisible()
    await expect(page.getByText(childName)).toBeVisible()

    // Delete only the child
    await page.locator(`[data-category-name="${childName}"]`).getByTestId('btn_category_delete').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).toBeVisible()
    await page.getByTestId('btn_confirm_delete_category').click()
    await expect(page.getByTestId('btn_confirm_delete_category')).not.toBeVisible({ timeout: 5000 })

    // Child gone, parent remains
    await expect(page.getByText(childName)).not.toBeVisible()
    await expect(page.getByText(parentName)).toBeVisible()
  })
})
