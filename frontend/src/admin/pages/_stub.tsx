interface StubProps {
  title: string;
  hint: string;
}

export function StubPage({ title, hint }: StubProps) {
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-black text-brand-navy">{title}</h1>
      <p className="text-brand-navy/60 text-sm max-w-prose">{hint}</p>
      <p className="text-brand-navy/40 text-xs">
        UI not built yet — the API endpoint exists; check{" "}
        <code className="font-mono">docs/api/openapi.yml</code> under the admin
        tag.
      </p>
    </div>
  );
}
