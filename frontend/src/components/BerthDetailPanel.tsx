import type { components } from "../api-types";
import { useBerthDetail } from "../hooks/useBerthDetail";

type Berth = components["schemas"]["Berth"];

interface BerthDetailPanelProps {
  berthId: string;
  onCloseCB: () => void;
  berth?: Berth;
}

export default function BerthDetailPanel({
  berthId,
  onCloseCB,
  berth: liveBerth,
}: BerthDetailPanelProps) {
  const { berth: fetchedBerth, isLoading, error } = useBerthDetail(berthId);

  const berth = liveBerth || fetchedBerth;

  return (
    <aside className="berth-detail-panel is-open">
      <div className="panel-header animate-fade-slide-up stagger-1">
        <h2 className="panel-title">Berth Details</h2>
        <button
          type="button"
          className="btn-close"
          onClick={onCloseCB}
          aria-label="Close panel"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="panel-content">
        {isLoading ? (
          <div className="loading-state animate-fade-slide-up stagger-2">
            <div className="skeleton-loader skeleton-title" />
            <div className="skeleton-loader skeleton-badge" />
            <div className="skeleton-grid">
              <div className="skeleton-loader" />
              <div className="skeleton-loader" />
              <div className="skeleton-loader" />
            </div>
            <div className="skeleton-loader" style={{ width: "30%" }} />
            <div className="skeleton-loader" style={{ width: "80%" }} />
          </div>
        ) : error ? (
          <div className="error-state animate-fade-slide-up stagger-2">
            <p>Error: {error}</p>
          </div>
        ) : berth ? (
          <div className="berth-info" key={berth.berth_id}>
            <div className="info-group animate-fade-slide-up stagger-2">
              <span className="label">Berth ID</span>
              <span className="value highlighting">
                {berth.label || berth.berth_id}
              </span>
            </div>

            <div className="info-group animate-fade-slide-up stagger-3">
              <span className="label">Status</span>
              <div className={`status-badge ${berth.status}`}>
                <span className="status-dot" />
                {berth.status.charAt(0).toUpperCase() + berth.status.slice(1)}
              </div>
            </div>

            <div className="info-grid animate-fade-slide-up stagger-4">
              <div className="info-group">
                <span className="label">Length</span>
                <span className="value">
                  {berth.length_m ? `${berth.length_m} m` : "N/A"}
                </span>
              </div>
              <div className="info-group">
                <span className="label">Width</span>
                <span className="value">
                  {berth.width_m ? `${berth.width_m} m` : "N/A"}
                </span>
              </div>
              <div className="info-group">
                <span className="label">Depth</span>
                <span className="value">
                  {berth.depth_m ? `${berth.depth_m} m` : "N/A"}
                </span>
              </div>
            </div>

            <div className="info-group animate-fade-slide-up stagger-5">
              <span className="label">Last Updated</span>
              <span className="value time">
                {berth.last_updated
                  ? (() => {
                      const d = new Date(berth.last_updated);
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const day = String(d.getDate()).padStart(2, "0");
                      const h = String(d.getHours()).padStart(2, "0");
                      const min = String(d.getMinutes()).padStart(2, "0");
                      const s = String(d.getSeconds()).padStart(2, "0");
                      return `${y}/${m}/${day} ${h}:${min}:${s}`;
                    })()
                  : "Never"}
              </span>
            </div>

            {berth.battery_pct != null && (
              <div className="info-group animate-fade-slide-up stagger-6">
                <span className="label">Node Battery</span>
                <div className="battery-level">
                  <div
                    className="battery-fill"
                    style={{ width: `${berth.battery_pct}%` }}
                  />
                  <span className="battery-text">{berth.battery_pct}%</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">No berth found</div>
        )}
      </div>

      <div className="panel-footer animate-fade-slide-up stagger-7">
        <button type="button" className="btn-primary-action" disabled>
          Request Berth Access (coming soon)
        </button>
      </div>
    </aside>
  );
}
