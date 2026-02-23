import { cn } from "@/lib/utils";

type ExampleButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
};

export function ExampleButton({
  label,
  variant = "primary",
  onClick,
}: ExampleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-sm border-none px-4 py-2 font-bold",
        variant === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {label}
    </button>
  );
}
