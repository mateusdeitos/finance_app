import { useEffect, useState } from 'react'

export interface SequentialProgressItem {
  label: string
}

export type SequentialProgressState = 'processing' | 'success' | 'error'

export interface SequentialProgressError {
  description: string
  reason: string
  remaining: string[]
}

interface Options<T extends SequentialProgressItem> {
  items: T[]
  action: (item: T) => Promise<void>
  onInvalidate: () => void
  onSuccess: () => void
}

interface Result {
  state: SequentialProgressState
  progress: number
  currentLabel: string
  errorInfo: SequentialProgressError | null
}

/**
 * Runs an async action over `items` in order, reporting progress. Stops at
 * the first failure and exposes which items did not run. The loop runs once
 * on mount; props are captured at mount time.
 */
export function useSequentialProgress<T extends SequentialProgressItem>({
  items,
  action,
  onInvalidate,
  onSuccess,
}: Options<T>): Result {
  const [state, setState] = useState<SequentialProgressState>('processing')
  const [progress, setProgress] = useState(0)
  const [currentLabel, setCurrentLabel] = useState('')
  const [errorInfo, setErrorInfo] = useState<SequentialProgressError | null>(null)

  useEffect(() => {
    async function run() {
      for (let i = 0; i < items.length; i++) {
        setCurrentLabel(items[i].label)
        setProgress(Math.round((i / items.length) * 100))

        try {
          await action(items[i])
        } catch (err) {
          let reason = 'Erro desconhecido'
          if (err instanceof Response) {
            try {
              const body = await err.json()
              reason = body.message ?? reason
            } catch {
              reason = `Erro ${err.status}`
            }
          }
          setErrorInfo({
            description: items[i].label,
            reason,
            remaining: items.slice(i + 1).map((t) => t.label),
          })
          setState('error')
          return
        }
      }

      setProgress(100)
      setCurrentLabel('')
      setState('success')
      onInvalidate()
      onSuccess()
    }

    void run()
    // Props captured at mount; re-running would double-submit. Callers mount
    // a fresh instance of the consuming component per operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, progress, currentLabel, errorInfo }
}
