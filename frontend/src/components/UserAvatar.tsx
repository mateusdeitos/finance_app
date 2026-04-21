import { Avatar, type MantineSize } from "@mantine/core"
import { getInitials } from "@/utils/getInitials"

interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size: MantineSize
  color?: string
}

export function UserAvatar({ name, avatarUrl, size, color = "blue" }: UserAvatarProps) {
  return (
    <Avatar
      src={avatarUrl}
      size={size}
      radius="xl"
      color={avatarUrl ? undefined : color}
      imageProps={{ referrerPolicy: "no-referrer" }}
      data-testid="avatar_user"
    >
      {getInitials(name)}
    </Avatar>
  )
}
