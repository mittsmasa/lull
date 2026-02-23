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
      style={{
        padding: "8px 16px",
        borderRadius: "4px",
        border: "none",
        cursor: "pointer",
        fontWeight: "bold",
        backgroundColor: variant === "primary" ? "#0070f3" : "#eaeaea",
        color: variant === "primary" ? "#fff" : "#000",
      }}
    >
      {label}
    </button>
  );
}
