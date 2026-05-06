import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="min-h-screen bg-brand-navy/5 flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-brand-navy/40">
          404
        </p>
        <h1 className="text-3xl font-black text-brand-navy">Page not found</h1>
        <Link
          to="/"
          className="inline-block mt-3 px-5 py-2 rounded-full bg-brand-navy text-white text-xs font-black uppercase tracking-widest"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
