import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  )
}

const DISMISSED_KEY = 'pwa-install-dismissed'

export function usePWAInstall() {
  const [showIOSBanner, setShowIOSBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showAndroidBanner, setShowAndroidBanner] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    if (isIOS()) {
      setShowIOSBanner(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowAndroidBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismissIOSBanner = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setShowIOSBanner(false)
  }

  const triggerAndroidInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      sessionStorage.setItem(DISMISSED_KEY, '1')
      setShowAndroidBanner(false)
      setDeferredPrompt(null)
    }
  }

  const dismissAndroidBanner = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setShowAndroidBanner(false)
    setDeferredPrompt(null)
  }

  return {
    showIOSBanner,
    dismissIOSBanner,
    showAndroidBanner,
    dismissAndroidBanner,
    triggerAndroidInstall,
  }
}
