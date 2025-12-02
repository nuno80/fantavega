"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";


export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = theme === "dark";

  console.log("[ThemeToggle] Current theme:", theme, "isDark:", isDark);

  return (
    <button
      onClick={() => {
        const newTheme = isDark ? "light" : "dark";
        console.log("[ThemeToggle] Toggling to:", newTheme);
        setTheme(newTheme);
      }}
      className="flex items-center space-x-2 rounded-md border border-border bg-background p-2 hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <>
          <Moon className="h-4 w-4 text-blue-400" />
          <span className="text-xs">Dark</span>
        </>
      ) : (
        <>
          <Sun className="h-4 w-4 text-yellow-500" />
          <span className="text-xs">Light</span>
        </>
      )}
    </button>
  );
}
