import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  // shown via native title attribute, doubles as aria-label fallback
  tooltip?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-blue text-white hover:bg-brand-blue/90",
  secondary: "bg-brand-navy/5 text-brand-navy hover:bg-brand-navy/10",
  danger: "bg-red-500/10 text-red-700 hover:bg-red-500/20",
  ghost: "text-brand-navy/70 hover:text-brand-navy",
};

export function Button({
  variant = "secondary",
  className,
  tooltip,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={rest["aria-label"] ?? tooltip}
      className={cn(
        "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
