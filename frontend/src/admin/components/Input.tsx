import { cn } from "../../lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: Props) {
  return (
    <input
      className={cn(
        "rounded-xl bg-white border border-black/10 px-3 py-2 text-xs",
        "focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
        "disabled:bg-brand-navy/5 disabled:text-brand-navy/40",
        className,
      )}
      {...rest}
    />
  );
}
