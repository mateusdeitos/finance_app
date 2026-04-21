import { ColorSwatch, SimpleGrid, Text, Stack } from "@mantine/core"

export const DEFAULT_AVATAR_COLOR = "#457b9d"

const PRESET_COLORS = [
  "#e63946",  // red
  "#ef7819",  // orange
  "#2a9d8f",  // teal
  "#457b9d",  // blue
  "#6a4c93",  // purple
  "#e91e8c",  // pink
  "#2d6a4f",  // forest
  "#f4a261",  // sand
  "#3d6b8c",  // steel
  "#1a1a1a",  // charcoal
  "#8b8b8b",  // grey
  "#39b2a3",  // mint
]

interface ColorSwatchPickerProps {
  value: string
  onChange: (hex: string) => void
  label?: string
}

export function ColorSwatchPicker({ value, onChange, label }: ColorSwatchPickerProps) {
  return (
    <Stack gap="xs" data-testid="color_swatch_picker">
      {label && <Text size="sm" fw={600}>{label}</Text>}
      <SimpleGrid cols={4} spacing={8}>
        {PRESET_COLORS.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            size={28}
            radius="xl"
            onClick={() => onChange(color)}
            aria-label={`Selecionar cor ${color}`}
            data-testid={`swatch_color_${color.replace('#', '')}`}
            data-selected={value === color ? "true" : undefined}
            style={{
              cursor: "pointer",
              boxShadow: value === color ? "0 0 0 2px white, 0 0 0 4px var(--mantine-color-dark-4)" : "none",
            }}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}
