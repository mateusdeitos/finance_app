import { Avatar, type MantineSize } from "@mantine/core"
import { getInitials } from "@/utils/getInitials"
import { Transactions } from "@/types/transactions"

interface AccountAvatarProps {
  account: Transactions.Account | null | undefined
  size: MantineSize
}

export function AccountAvatar({ account, size }: AccountAvatarProps) {
  if (!account) return <Avatar size={size} radius="xl" />

  const isShared = !!account.user_connection

  if (isShared) {
    const partnerAvatarUrl = account.user_connection?.partner_avatar_url
    const partnerName = account.user_connection?.partner_name ?? account.name
    return (
      <Avatar src={partnerAvatarUrl} size={size} radius="xl" color="grape">
        {getInitials(partnerName)}
      </Avatar>
    )
  }

  return (
    <Avatar
      size={size}
      radius="xl"
      color={undefined}
      style={{ backgroundColor: account.avatar_background_color ?? "#457b9d" }}
    >
      {getInitials(account.name)}
    </Avatar>
  )
}
