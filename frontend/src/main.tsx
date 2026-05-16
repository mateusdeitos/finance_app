import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import App from './App'
import { theme } from './theme'
import { queryClient } from './queryClient'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications position="top-right" autoClose={3000} />
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
)
