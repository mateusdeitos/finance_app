import { useEffect, useState } from 'react'

/**
 * Cycles 0..stepCount-1 on an interval. Islands only mount when scrolled into
 * view (Astro `client:visible`), so the interval naturally starts on first
 * appearance — no separate "is it visible" gating needed here.
 */
export function useLoopStep(stepCount: number, intervalMs = 1700) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((current) => (current + 1) % stepCount), intervalMs)
    return () => clearInterval(id)
  }, [stepCount, intervalMs])

  return step
}
