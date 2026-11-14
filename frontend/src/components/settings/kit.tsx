import {
  type ReactNode,
  useId,
  isValidElement,
  cloneElement,
  Children,
} from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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
    <Card padding="lg" className={cn("mb-4", className)}>
      {(title || subtitle || action) && (
        <div className="mb-5 flex justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <div className="text-[17px] font-bold tracking-[-0.01em] mb-1 text-foreground">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="text-sm text-muted-foreground leading-relaxed max-w-[640px]">
                {subtitle}
              </div>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
      {footer && (
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
          {footer}
        </div>
      )}
    </Card>
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
        <div className="text-xs font-medium text-foreground-secondary mb-1.5">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-muted-foreground max-w-[620px]">
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

export function SLabel({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  /** When provided, renders a `<label>` element with this `htmlFor` value. */
  htmlFor?: string;
  className?: string;
}) {
  const inner = (
    <>
      <div className="text-xs font-medium text-muted-foreground">
        {children}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </>
  );
  if (htmlFor) {
    return (
      <label
        htmlFor={htmlFor}
        className={cn("flex justify-between items-baseline mb-1.5", className)}
      >
        {inner}
      </label>
    );
  }
  return (
    <div
      className={cn("flex justify-between items-baseline mb-1.5", className)}
    >
      {inner}
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
  const generatedId = useId();
  // Inject `id` into the first React element child so the label's `htmlFor`
  // points to it. Works for single-child rows (SInput, select, textarea) and
  // also for multi-child rows where the first child is the control and the
  // rest are hint elements.
  const childArray = Children.toArray(children);
  const [firstChild, ...restChildren] = childArray;
  const patchedFirst =
    firstChild && isValidElement(firstChild)
      ? cloneElement(firstChild as React.ReactElement<{ id?: string }>, {
          id: generatedId,
        })
      : firstChild;

  return (
    <div className={cn("mb-3.5", className)}>
      <SLabel hint={hint} htmlFor={generatedId}>
        {label}
      </SLabel>
      {patchedFirst}
      {restChildren}
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
  const labelId = useId();
  return (
    <div className="flex items-center justify-between py-3.5 gap-5 border-b border-border last:border-b-0">
      <div className="min-w-0 flex-1">
        <div
          id={labelId}
          className="text-sm font-semibold text-foreground mb-0.5"
        >
          {label}
        </div>
        {sub && (
          <div
            className={cn(
              "text-xs font-mono leading-relaxed",
              warning ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {sub}
          </div>
        )}
      </div>
      <SToggle
        on={on}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={labelId}
      />
    </div>
  );
}

type SToggleProps = {
  on: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
} & (
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never }
);

export function SToggle({
  on,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={cn(
        "relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        on ? "bg-primary" : "bg-accent",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all shadow",
          on
            ? "left-5 bg-primary-foreground"
            : "left-0.5 bg-foreground-secondary",
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
          ? "bg-primary-soft border-primary-border"
          : "bg-muted border-transparent hover:bg-muted/80",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center",
          selected ? "border-primary" : "border-input",
        )}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold mb-0.5",
            selected ? "text-primary-text" : "text-foreground",
          )}
        >
          {title}
        </span>
        {desc && (
          <span className="block text-xs text-muted-foreground leading-relaxed">
            {desc}
          </span>
        )}
      </span>
    </button>
  );
}

type PillKind = "ok" | "warning" | "error" | "neutral" | "amber";

const PILL_STYLES: Record<PillKind, string> = {
  ok: "bg-success/10 text-success border-success/25",
  warning: "bg-primary-soft text-primary-text border-primary-border",
  error: "bg-destructive-soft text-destructive border-destructive/25",
  neutral: "bg-accent text-muted-foreground border-border",
  amber: "bg-primary-soft text-primary-text border-primary-border",
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
        "inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border text-[11px] font-bold tracking-[0.08em] whitespace-nowrap",
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
  info: "bg-fill-subtle border-border text-muted-foreground",
  amber: "bg-primary-soft border-primary-border text-foreground-secondary",
  danger: "bg-destructive-soft border-destructive/25 text-foreground-secondary",
  success: "bg-success/10 border-success/25 text-foreground-secondary",
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
        "p-3 rounded-md border text-[12.5px] leading-relaxed",
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
      <div className="flex-1 h-px bg-accent" />
      {label && (
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      )}
      <div className="flex-1 h-px bg-accent" />
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
    <div className="flex justify-between gap-3 py-2 border-b border-border text-xs">
      <div className="font-mono tracking-[0.04em] text-muted-foreground shrink-0">
        {k}
      </div>
      <div
        className={cn(
          "text-right text-foreground-secondary min-w-0 truncate",
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
    "inline-flex items-center gap-1.5 font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const size = small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[13px]";
  const variants: Record<SButtonVariant, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    ghost:
      "bg-fill-subtle text-foreground-secondary border border-border hover:bg-accent",
    outline:
      "bg-transparent text-foreground-secondary border border-border hover:bg-fill-subtle",
    link: "bg-transparent text-primary-text hover:text-primary-text px-1 py-1",
  };
  const dangerStyle =
    "bg-destructive-soft text-destructive border border-destructive/30 hover:bg-destructive-soft/80";
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
  id,
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
  id?: string;
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
      id={id}
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
        "w-full px-3 py-2.5 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent disabled:opacity-50",
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
        "p-3 rounded-md border text-sm",
        kind === "success"
          ? "bg-success/10 border-success/25 text-success"
          : "bg-destructive-soft border-destructive/25 text-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}
