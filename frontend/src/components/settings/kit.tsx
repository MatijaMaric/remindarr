import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SCard({
  title,
  subtitle,
  action,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-zinc-900 border border-white/[0.06] rounded-xl p-6 mb-4",
        className,
      )}
    >
      {(title || subtitle || action) && (
        <div className="mb-5 flex justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <div className="text-[17px] font-bold tracking-[-0.01em] mb-1 text-zinc-100">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="text-sm text-zinc-500 leading-relaxed max-w-[640px]">
                {subtitle}
              </div>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
      {footer && (
        <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-center justify-between gap-3">
          {footer}
        </div>
      )}
    </div>
  );
}

export function SHead({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-4", className)}>
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400 mb-1.5">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-zinc-400 max-w-[620px]">{subtitle}</div>
        )}
      </div>
      {action}
    </div>
  );
}

export function SLabel({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between items-baseline mb-1.5", className)}>
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {children}
      </div>
      {hint && <div className="text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

export function SFormRow({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3.5", className)}>
      <SLabel hint={hint}>{label}</SLabel>
      {children}
    </div>
  );
}

export function SSwitch({
  label,
  sub,
  on,
  onChange,
  disabled,
  warning,
}: {
  label: ReactNode;
  sub?: ReactNode;
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 gap-5 border-b border-white/[0.04] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-100 mb-0.5">{label}</div>
        {sub && (
          <div
            className={cn(
              "text-xs font-mono leading-relaxed",
              warning ? "text-red-400" : "text-zinc-500",
            )}
          >
            {sub}
          </div>
        )}
      </div>
      <SToggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function SToggle({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={cn(
        "relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        on ? "bg-amber-400" : "bg-white/[0.12]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all shadow",
          on ? "left-5 bg-black" : "left-0.5 bg-zinc-200",
        )}
      />
    </button>
  );
}

export function SRadioCard({
  selected,
  title,
  desc,
  onClick,
  disabled,
  asRadio = false,
}: {
  selected?: boolean;
  title: ReactNode;
  desc?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** When true the button advertises `role="radio"` for ARIA. Default false so
   *  it can sit inside a `<label>` that already wraps a native `<input type="radio">`
   *  without double-counting under `getAllByRole("radio")`. */
  asRadio?: boolean;
}) {
  return (
    <button
      type="button"
      role={asRadio ? "radio" : undefined}
      aria-checked={asRadio ? !!selected : undefined}
      aria-pressed={asRadio ? undefined : !!selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left flex items-start gap-3.5 p-3.5 rounded-[10px] border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        selected
          ? "bg-amber-400/[0.08] border-amber-400/30"
          : "bg-zinc-800 border-transparent hover:bg-zinc-800/80",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center",
          selected ? "border-amber-400" : "border-zinc-600",
        )}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold mb-0.5",
            selected ? "text-amber-400" : "text-zinc-100",
          )}
        >
          {title}
        </span>
        {desc && (
          <span className="block text-xs text-zinc-400 leading-relaxed">{desc}</span>
        )}
      </span>
    </button>
  );
}

type PillKind = "ok" | "warning" | "error" | "neutral" | "amber";

const PILL_STYLES: Record<PillKind, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  warning: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  error: "bg-red-500/10 text-red-400 border-red-500/25",
  neutral: "bg-white/[0.06] text-zinc-400 border-white/[0.08]",
  amber: "bg-amber-400/10 text-amber-400 border-amber-400/30",
};

export function SStatusPill({
  kind = "neutral",
  children,
  className,
}: {
  kind?: PillKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border font-mono text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap",
        PILL_STYLES[kind],
        className,
      )}
    >
      {children}
    </span>
  );
}

type HintKind = "info" | "amber" | "danger" | "success";

const HINT_STYLES: Record<HintKind, string> = {
  info: "bg-white/[0.03] border-white/[0.06] text-zinc-400",
  amber: "bg-amber-400/[0.06] border-amber-400/30 text-zinc-300",
  danger: "bg-red-500/10 border-red-500/25 text-zinc-200",
  success: "bg-emerald-500/10 border-emerald-500/25 text-zinc-200",
};

export function SHint({
  kind = "info",
  children,
  className,
}: {
  kind?: HintKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border text-[12.5px] leading-relaxed",
        HINT_STYLES[kind],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SDivider({
  label,
  className,
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 my-5 mb-3.5", className)}>
      <div className="flex-1 h-px bg-white/[0.06]" />
      {label && (
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {label}
        </div>
      )}
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

export function SKeyValue({
  k,
  v,
  mono = true,
}: {
  k: ReactNode;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-white/[0.04] text-xs">
      <div className="font-mono tracking-[0.04em] text-zinc-500 shrink-0">{k}</div>
      <div
        className={cn(
          "text-right text-zinc-200 min-w-0 truncate",
          mono && "font-mono",
        )}
        title={typeof v === "string" ? v : undefined}
      >
        {v}
      </div>
    </div>
  );
}

type SButtonVariant = "primary" | "ghost" | "outline" | "link";

export function SButton({
  children,
  variant = "primary",
  small,
  danger,
  type = "button",
  disabled,
  onClick,
  className,
  icon,
}: {
  children: ReactNode;
  variant?: SButtonVariant;
  small?: boolean;
  danger?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  icon?: ReactNode;
}) {
  const base =
    "inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const size = small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[13px]";
  const variants: Record<SButtonVariant, string> = {
    primary: "bg-amber-400 text-black hover:bg-amber-300",
    ghost:
      "bg-white/[0.06] text-zinc-200 border border-white/[0.08] hover:bg-white/[0.1]",
    outline:
      "bg-transparent text-zinc-300 border border-white/[0.08] hover:bg-white/[0.04]",
    link: "bg-transparent text-amber-400 hover:text-amber-300 px-1 py-1",
  };
  const dangerStyle =
    "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/20";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        base,
        size,
        danger ? dangerStyle : variants[variant],
        className,
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

export function SInput({
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
  readOnly,
  disabled,
  required,
  minLength,
  autoFocus,
  inputMode,
  className,
  "aria-label": ariaLabel,
  list,
  autoComplete,
}: {
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
  "aria-label"?: string;
  list?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      required={required}
      minLength={minLength}
      autoFocus={autoFocus}
      inputMode={inputMode}
      list={list}
      autoComplete={autoComplete}
      aria-label={ariaLabel}
      className={cn(
        "w-full px-3 py-2.5 bg-zinc-800 border border-white/[0.08] rounded-lg text-zinc-100 placeholder-zinc-500 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:border-transparent disabled:opacity-50",
        mono && "font-mono",
        className,
      )}
    />
  );
}

export function SMessage({
  kind,
  children,
  className,
}: {
  kind: "success" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border text-sm",
        kind === "success"
          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
          : "bg-red-500/10 border-red-500/25 text-red-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
