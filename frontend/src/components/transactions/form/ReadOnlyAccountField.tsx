import { Avatar, Input, Text } from "@mantine/core";
import { getInitials } from "@/utils/getInitials";
import classes from "./ReadOnlyAccountField.module.css";

interface Props {
  label: string;
  required?: boolean;
  avatarUrl?: string;
  /** Displayed name (typically the partner's). */
  name: string;
  /** Helper text rendered below the label (e.g. "Conta de outro usuário"). */
  description?: string;
}

/**
 * Read-only display used in the Update form when the source or destination
 * account belongs to a partner — the account_id isn't in `useAccounts()` and
 * can't be rendered as a Mantine `Select` value. Shows the partner's avatar
 * (resolved from the user connection) and a name.
 */
export function ReadOnlyAccountField({ label, required, avatarUrl, name, description }: Props) {
  return (
    <Input.Wrapper label={label} required={required} description={description}>
      <div className={classes.field}>
        <Avatar
          size={22}
          src={avatarUrl}
          radius="xl"
          color="grape"
          imageProps={{ referrerPolicy: "no-referrer" }}
        >
          {getInitials(name)}
        </Avatar>
        <Text size="sm" fw={500} truncate>
          {name}
        </Text>
      </div>
    </Input.Wrapper>
  );
}
