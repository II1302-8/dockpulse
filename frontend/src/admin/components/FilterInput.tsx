import { Search } from "lucide-react";
import { cn } from "../../lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}

export function FilterInput({
  value,
  onChange,
  placeholder = "Filter…",
  className,
}: Props) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy/30"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-black/10 bg-white py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
      />
    </div>
  );
}
