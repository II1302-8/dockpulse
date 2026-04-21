import type { components } from "../api-types";

type Berth = components["schemas"]["Berth"];

interface HarborOverviewProps {
  berths: Berth[];
}

export default function HarborOverview({ berths }: HarborOverviewProps) {
  const totalBerths = berths.length;
  const occupiedBerths = berths.filter((b) => b.status === "occupied").length;
  const occupancyRate =
    totalBerths > 0 ? (occupiedBerths / totalBerths) * 100 : 0;

  const lowBatteryNodes = berths.filter(
    (b) => b.battery_pct != null && b.battery_pct < 20,
  );

  return (
    <section className="harbor-overview">
      <header className="overview-header animate-fade-slide-up stagger-1">
        <h2 className="overview-title">Harbor Overview</h2>
        <p className="overview-subtitle">
          Real-time marina status and node health
        </p>
      </header>

      <div className="overview-grid">
        {/* Capacity Card */}
        <article className="stat-card animate-fade-slide-up stagger-2">
          <div className="stat-label">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Capacity Icon</title>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Total Capacity
          </div>
          <div className="stat-value">
            {totalBerths}
            <span className="stat-unit">Berths</span>
          </div>
        </article>

        {/* Occupancy Card */}
        <article className="stat-card animate-fade-slide-up stagger-3">
          <div className="stat-label">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Occupancy Icon</title>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Current Occupancy
          </div>
          <div className="stat-value">
            {occupancyRate.toFixed(0)}
            <span className="stat-unit">%</span>
          </div>
          <div className="occupancy-container">
            <div className="occupancy-track">
              <div
                className="occupancy-fill"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
        </article>

        {/* Node Health Card */}
        <article className="stat-card animate-fade-slide-up stagger-4">
          <div className="stat-label">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>System Health Icon</title>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            System Health
          </div>
          <div className="stat-value">
            {totalBerths - lowBatteryNodes.length}
            <span className="stat-unit">/ {totalBerths} Online</span>
          </div>

          {lowBatteryNodes.length > 0 && (
            <div className="alert-item">
              <svg
                className="alert-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Alert Icon</title>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="alert-text">
                {lowBatteryNodes.length} Low Battery Alerts
              </span>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
