import { cn } from "@/lib/utils";

export type ParticipantAvatarVariant =
  | "organizer"
  | "performer"
  | "accepted"
  | "pending"
  | "invalidated";

type Props = {
  displayName: string;
  variant: ParticipantAvatarVariant;
  className?: string;
};

const variantClass: Record<ParticipantAvatarVariant, string> = {
  organizer: "bg-primary/12 text-primary",
  performer: "bg-muted text-foreground",
  accepted: "bg-foreground/8 text-foreground",
  pending:
    "border border-dashed border-border bg-background/40 text-muted-foreground",
  invalidated:
    "border border-dashed border-border bg-background/40 text-muted-foreground/70 line-through",
};

export function ParticipantAvatar({ displayName, variant, className }: Props) {
  const initial = Array.from(displayName.trim())[0] ?? "?";

  return (
    <div
      aria-hidden
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[15px] tracking-wide",
        variantClass[variant],
        className,
      )}
    >
      {initial}
    </div>
  );
}
