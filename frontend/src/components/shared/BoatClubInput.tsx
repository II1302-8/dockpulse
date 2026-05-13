import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

type BoatClubInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  onValueChange: (value: string) => void;
  renderInput: (
    inputProps: React.InputHTMLAttributes<HTMLInputElement>,
  ) => React.ReactNode;
};

export function BoatClubInput({
  value,
  onValueChange,
  renderInput,
  onFocus,
  onBlur,
  onChange,
  ...rest
}: BoatClubInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");

  // debounced lookup so each keystroke doesn't hammer the api. lastQuery
  // guards against stale responses overwriting fresher ones
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const trimmed = value.trim();
      lastQueryRef.current = trimmed;
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ limit: "8" });
        if (trimmed) params.set("q", trimmed);
        const res = await apiFetch(`/api/users/boat-clubs?${params}`);
        if (lastQueryRef.current !== trimmed) return;
        if (res.ok) {
          const rows = (await res.json()) as string[];
          setSuggestions(
            rows.filter((s) => s.toLowerCase() !== trimmed.toLowerCase()),
          );
        }
      } finally {
        if (lastQueryRef.current === trimmed) setIsLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, isOpen]);

  const showDropdown = isOpen && (suggestions.length > 0 || isLoading);

  return (
    <div className="relative">
      {renderInput({
        value,
        autoComplete: "off",
        onChange: (e) => {
          onValueChange(e.target.value);
          onChange?.(e);
        },
        onFocus: (e) => {
          setIsOpen(true);
          onFocus?.(e);
        },
        onBlur: (e) => {
          // delay so a click on a suggestion still registers
          window.setTimeout(() => setIsOpen(false), 150);
          onBlur?.(e);
        },
        ...rest,
      })}
      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {isLoading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs font-bold text-brand-navy/40">
              Searching...
            </li>
          ) : (
            suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onValueChange(s);
                    setIsOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-brand-navy transition-colors hover:bg-brand-blue/5"
                >
                  {s}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
