import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import 'dayjs/locale/pt-br'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import App from './App'
import { theme } from './theme'
import { queryClient } from './queryClient'

// Mantine's DateInput parses user-typed input via dayjs(value, valueFormat, locale).
// Without customParseFormat, dayjs ignores the format string and falls back to
// native Date.parse — making "10/07/2026" mean Oct 7 instead of Jul 10.
dayjs.extend(customParseFormat)
dayjs.locale('pt-br')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
          <Notifications position="top-right" autoClose={3000} />
          <App />
        </DatesProvider>
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
)

const splash = document.getElementById('app-splash')
if (splash) {
  splash.classList.add('is-hidden')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
