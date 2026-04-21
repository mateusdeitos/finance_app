import { Text } from '@mantine/core'

export function FeatureItem({ emoji, text }: { emoji: string; text: string }) {
  return (
    <Text c="dimmed" size="sm">
      {emoji} {text}
    </Text>
  )
}
