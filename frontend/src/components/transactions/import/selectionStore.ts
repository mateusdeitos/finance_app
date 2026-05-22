import { create } from 'zustand'

interface SelectionStore {
  selected: Set<string>
  anchorIndex: number | null
  toggle: (rowIndex: number, shiftKey: boolean, fieldIds: string[]) => void
  selectAll: (fieldIds: string[]) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selected: new Set(),
  anchorIndex: null,

  toggle: (rowIndex, shiftKey, fieldIds) => {
    set((state) => {
      const id = fieldIds[rowIndex]
      if (id === undefined) return state

      if (shiftKey) {
        // Range-select from the anchor (last plain-clicked row) to the clicked
        // row, in either direction. With no anchor yet, fall back to row 0.
        const anchor = state.anchorIndex ?? 0
        const next = new Set(state.selected)
        const start = Math.min(anchor, rowIndex)
        const end = Math.max(anchor, rowIndex)
        for (let i = start; i <= end; i++) {
          const fillId = fieldIds[i]
          if (fillId !== undefined) next.add(fillId)
        }
        return { selected: next, anchorIndex: rowIndex }
      }

      const next = new Set(state.selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selected: next, anchorIndex: rowIndex }
    })
  },

  selectAll: (fieldIds) => set({ selected: new Set(fieldIds) }),

  clear: () => set({ selected: new Set(), anchorIndex: null }),
}))
