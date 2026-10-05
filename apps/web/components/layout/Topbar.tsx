import type { ReactNode } from "react";
import { Check, Menu, Monitor, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "@shared/types.ts";
import { Button } from "../ui/Button.tsx";
import { Dropdown, DropdownItem, DropdownLabel } from "../ui/Dropdown.tsx";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="size-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-4" /> },
  { value: "system", label: "System", icon: <Monitor className="size-4" /> },
];

export function Topbar({
  title,
  subtitle,
  actions,
  theme,
  onThemeChange,
  onOpenSidebar,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenSidebar: () => void;
}) {
  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2]!;

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/85">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Dropdown
          trigger={({ toggle }) => (
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Change theme">
              {current.icon}
            </Button>
          )}
          width="w-44"
        >
          <DropdownLabel>Appearance</DropdownLabel>
          {THEME_OPTIONS.map((option) => (
            <DropdownItem
              key={option.value}
              icon={option.icon}
              onClick={() => onThemeChange(option.value)}
            >
              <span className="flex items-center justify-between gap-2">
                {option.label}
                {theme === option.value ? <Check className="size-3.5 text-brand-600 dark:text-brand-400" /> : null}
              </span>
            </DropdownItem>
          ))}
        </Dropdown>
      </div>
    </header>
  );
}
