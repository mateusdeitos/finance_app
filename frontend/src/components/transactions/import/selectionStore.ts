import { create } from 'zustand'

interface SelectionStore {
  selected: Set<string>
  toggle: (rowIndex: number, shiftKey: boolean, fieldIds: string[]) => void
  selectAll: (fieldIds: string[]) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selected: new Set(),

  toggle: (rowIndex, shiftKey, fieldIds) => {
    set((state) => {
      const id = fieldIds[rowIndex]
      if (id === undefined) return state

      const next = new Set(state.selected)
      const wasSelected = next.has(id)
      if (wasSelected) next.delete(id)
      else next.add(id)

      if (!shiftKey) return { selected: next }

      const selecting = !wasSelected
      let nearestAbove = -1
      for (let i = rowIndex - 1; i >= 0; i--) {
        const candidateId = fieldIds[i]
        if (candidateId !== undefined && state.selected.has(candidateId)) {
          nearestAbove = i
          break
        }
      }

      const start = nearestAbove + 1
      for (let i = start; i < rowIndex; i++) {
        const fillId = fieldIds[i]
        if (fillId === undefined) continue
        if (selecting) next.add(fillId)
        else next.delete(fillId)
      }

      return { selected: next }
    })
  },

  selectAll: (fieldIds) => set({ selected: new Set(fieldIds) }),

  clear: () => set({ selected: new Set() }),
}))
