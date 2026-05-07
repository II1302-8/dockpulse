import { AlertCircle } from "lucide-react";

export function ErrorBlock({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="p-4 bg-red-500/5 border border-red-500/15 rounded-2xl text-red-600 text-xs flex items-start gap-2">
      <AlertCircle size={16} strokeWidth={2.5} className="shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-bold">{message}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-700 hover:underline"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
