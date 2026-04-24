import { Avatar, type MantineSize } from "@mantine/core";
import { getInitials } from "@/utils/getInitials";
import { DEFAULT_AVATAR_COLOR } from "@/components/accounts/ColorSwatchPicker";
import { Transactions } from "@/types/transactions";
import { CommonTestIds } from "@/testIds";
import { useMe } from "@/hooks/useMe";

interface AccountAvatarProps {
  account: Transactions.Account | null | undefined;
  size: MantineSize | number;
}

export function AccountAvatar({ account, size }: AccountAvatarProps) {
  const {
    query: { data: currentUserId },
  } = useMe((me) => me.id);
  if (!account || !currentUserId)
    return <Avatar size={size} radius="xl" data-testid={CommonTestIds.AvatarAccountEmpty} />;

  const isShared = !!account.user_connection;

  if (isShared) {
    const conn = account.user_connection!;
    const isFromUser = conn.from_user_id === currentUserId;
    const partnerAvatarUrl = isFromUser ? conn.to_user_avatar_url : conn.from_user_avatar_url;
    const partnerName = (isFromUser ? conn.to_user_name : conn.from_user_name) ?? account.name;
    return (
      <Avatar
        src={partnerAvatarUrl}
        size={size}
        radius="xl"
        color={partnerAvatarUrl ? undefined : "grape"}
        imageProps={{ referrerPolicy: "no-referrer" }}
        data-testid={CommonTestIds.AvatarAccount}
      >
        {getInitials(partnerName)}
      </Avatar>
    );
  }

  return (
    <Avatar
      size={size}
      radius="xl"
      color={undefined}
      styles={{
        placeholder: { backgroundColor: account.avatar_background_color ?? DEFAULT_AVATAR_COLOR, color: "white" },
      }}
      data-testid={CommonTestIds.AvatarAccount}
    >
      {getInitials(account.name)}
    </Avatar>
  );
}
