export function SectionHead({
  title,
  hint,
  onBack,
}: {
  title: string;
  hint?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-black text-brand-navy">{title}</h3>
        {hint && (
          <p className="text-[10px] text-brand-navy/40 font-mono">{hint}</p>
        )}
      </div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/50 hover:text-brand-navy"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
