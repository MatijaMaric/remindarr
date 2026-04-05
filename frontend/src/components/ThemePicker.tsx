import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../hooks/useTheme";

const THEMES: { value: Theme; labelKey: string }[] = [
  { value: "dark", labelKey: "settings.theme.dark" },
  { value: "light", labelKey: "settings.theme.light" },
  { value: "oled", labelKey: "settings.theme.oled" },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
      {THEMES.map(({ value, labelKey }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              isActive
                ? "bg-amber-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
            }`}
            aria-pressed={isActive}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
