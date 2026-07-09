"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const themeOptions = [
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
  { value: "system", label: "システム", icon: Desktop },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9 w-full" aria-hidden />;
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={theme}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
      className="w-full"
    >
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          className="flex-1"
        >
          <Icon weight="light" className="size-4" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
