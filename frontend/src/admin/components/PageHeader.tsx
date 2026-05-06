interface Props {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, hint, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-black text-brand-navy">{title}</h1>
        {hint && (
          <p className="text-brand-navy/60 text-sm mt-1 max-w-prose">{hint}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
