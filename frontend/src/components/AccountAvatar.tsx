import { Avatar, type MantineSize } from "@mantine/core"
import { getInitials } from "@/utils/getInitials"
import { DEFAULT_AVATAR_COLOR } from "@/components/accounts/ColorSwatchPicker"
import { Transactions } from "@/types/transactions"

interface AccountAvatarProps {
  account: Transactions.Account | null | undefined
  size: MantineSize
}

export function AccountAvatar({ account, size }: AccountAvatarProps) {
  if (!account) return <Avatar size={size} radius="xl" />

  const isShared = !!account.user_connection

  if (isShared) {
    const conn = account.user_connection!
    const isFromUser = conn.from_user_id === account.user_id
    const partnerAvatarUrl = isFromUser ? conn.to_user_avatar_url : conn.from_user_avatar_url
    const partnerName = (isFromUser ? conn.to_user_name : conn.from_user_name) ?? account.name
    return (
      <Avatar
        src={partnerAvatarUrl}
        size={size}
        radius="xl"
        color={partnerAvatarUrl ? undefined : "grape"}
        imageProps={{ referrerPolicy: "no-referrer" }}
      >
        {getInitials(partnerName)}
      </Avatar>
    )
  }

  return (
    <Avatar
      size={size}
      radius="xl"
      color={undefined}
      style={{ backgroundColor: account.avatar_background_color ?? DEFAULT_AVATAR_COLOR }}
    >
      {getInitials(account.name)}
    </Avatar>
  )
}
