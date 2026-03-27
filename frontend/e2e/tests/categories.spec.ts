import { test, expect } from '@playwright/test'
import { CategoriesPage } from '../pages/CategoriesPage'
import { apiCreateCategory, apiDeleteCategory } from '../helpers/api'

test.describe('Categories', () => {
  let categoriesPage: CategoriesPage
  const createdIds: number[] = []

  test.beforeEach(async ({ page }) => {
    categoriesPage = new CategoriesPage(page)
    await categoriesPage.goto()
  })

  test.afterAll(async () => {
    // Delete in reverse order to avoid FK issues (children before parents)
    for (const id of [...createdIds].reverse()) {
      await apiDeleteCategory(id).catch(() => undefined)
    }
  })

  // ── 5.2 ──────────────────────────────────────────────────────────────────
  test('create a root category via inline input', async () => {
    const name = `Cat Raiz ${Date.now()}`

    await categoriesPage.createRootCategory(name)

    await expect(categoriesPage.page.getByText(name)).toBeVisible()
  })

  // ── 5.3 ──────────────────────────────────────────────────────────────────
  test('create a subcategory under a parent', async () => {
    const parentName = `Parent ${Date.now()}`
    const childName = `Child ${Date.now()}`

    // Create parent via API for reliability
    const parent = await apiCreateCategory({ name: parentName })
    createdIds.push(parent.id)

    await categoriesPage.goto()
    await categoriesPage.createSubcategory(parentName, childName)

    await expect(categoriesPage.page.getByText(childName)).toBeVisible()
  })

  // ── 5.4 ──────────────────────────────────────────────────────────────────
  test('edit a category name inline', async () => {
    const original = `Cat Edit ${Date.now()}`
    const updated = `Cat Editada ${Date.now()}`

    const cat = await apiCreateCategory({ name: original })
    createdIds.push(cat.id)

    await categoriesPage.goto()
    await categoriesPage.editCategoryName(original, updated)

    await expect(categoriesPage.page.getByText(updated)).toBeVisible()
    await expect(categoriesPage.page.getByText(original)).not.toBeVisible()
  })

  // ── 5.5 ──────────────────────────────────────────────────────────────────
  test('delete a category', async () => {
    const name = `Cat Deletar ${Date.now()}`

    const cat = await apiCreateCategory({ name })
    createdIds.push(cat.id)

    await categoriesPage.goto()
    await categoriesPage.deleteCategory(name)

    await expect(categoriesPage.page.getByText(name)).not.toBeVisible()
    // Remove from cleanup list since it's already deleted
    const idx = createdIds.indexOf(cat.id)
    if (idx !== -1) createdIds.splice(idx, 1)
  })
})
