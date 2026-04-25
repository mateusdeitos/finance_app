import { Avatar, type MantineSize } from "@mantine/core";
import { getInitials } from "@/utils/getInitials";
import { DEFAULT_AVATAR_COLOR } from "@/components/accounts/ColorSwatchPicker";
import { Transactions } from "@/types/transactions";
import { CommonTestIds } from "@/testIds";
import { useMe } from "@/hooks/useMe";

interface AccountAvatarProps {
  direction?: "from" | "to";
  account: Transactions.Account | null | undefined;
  size: MantineSize | number;
}

export function AccountAvatar({ account, size, direction = "from" }: AccountAvatarProps) {
  const {
    query: { data: currentUserId },
  } = useMe((me) => me.id);
  if (!account || !currentUserId)
    return <Avatar size={size} radius="xl" data-testid={CommonTestIds.AvatarAccountEmpty} />;

  const isShared = !!account.user_connection;

  if (isShared) {
    const conn = account.user_connection!;
    const isFromUser = conn.from_user_id === currentUserId;
    const avatars: [string | undefined, string | undefined] = [conn.to_user_avatar_url, conn.from_user_avatar_url];
    const names: [string | undefined, string | undefined] = [conn.to_user_name, conn.from_user_name];
    if (direction === "to") {
      avatars.reverse();
      names.reverse();
    }

    const partnerAvatarUrl = isFromUser ? avatars[0] : avatars[1];
    const partnerName = (isFromUser ? names[0] : names[1]) ?? account.name;
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
