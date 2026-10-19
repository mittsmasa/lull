import { cn } from "@/lib/utils";

/**
 * 本文行の placeholder。罫線 1 本で「ここに文字が入る」を示す。
 * 幅を `className` で指定する（例: `w-2/3`）。
 */
export function SkeletonRule({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-px w-full bg-border motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

/**
 * 見出しやボタンなど、高さを確保したい placeholder。
 * 高さと幅を `className` で指定する（例: `h-7 w-1/2`）。
 */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-4 w-full rounded-sm bg-border/60 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
