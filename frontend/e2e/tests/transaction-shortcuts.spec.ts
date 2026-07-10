import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import { TransactionsTestIds } from '@/testIds'

/**
 * PWA app shortcuts (long-press the installed icon) deep-link into
 * `/transactions?new=<type>`. Landing on that URL should open the
 * create-transaction drawer pre-set to the matching type, then strip the param
 * so a refresh/back-nav doesn't reopen it.
 */
test.describe('Transaction app shortcuts', () => {
  let transactionsPage: TransactionsPage

  test.beforeEach(({ page }) => {
    transactionsPage = new TransactionsPage(page)
  })

  for (const type of ['expense', 'income', 'transfer'] as const) {
    test(`?new=${type} opens the create drawer pre-set to ${type}`, async () => {
      await transactionsPage.gotoCreateShortcut(type)
      await transactionsPage.assertCreateTypeSelected(type)
    })
  }

  test('the new param is stripped from the URL after opening', async ({ page }) => {
    await transactionsPage.gotoCreateShortcut('income')

    // The drawer is open but the deep-link param is gone, so reloading or
    // navigating back won't reopen it.
    await expect(page).toHaveURL(/\/transactions(\?(?!.*\bnew=).*)?$/)

    await page.reload()
    await expect(page.getByTestId(TransactionsTestIds.DrawerCreate)).not.toBeVisible()
  })
})
