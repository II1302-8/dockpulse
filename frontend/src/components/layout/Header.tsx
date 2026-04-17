import { NavLink } from "react-router-dom";

const Header = () => {
  return (
    <header className="app-header glass">
      <div className="header-brand">
        <h1>Dock<span className="accent">Pulse</span></h1>
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", opacity: 0.8, fontWeight: 500, alignSelf: "flex-end", marginBottom: "0.25rem", marginLeft: "0.25rem" }}>saltsjöbaden</span>
      </div>

      <nav className="header-nav">
        <ul>
          <li>
            <NavLink
              to="/saltsjobaden"
              className={function getClassNameCB({ isActive }) { return isActive ? "active" : ""; }}
            >
              Dashboard
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="header-actions">
        {/* Placeholder for user profile or settings icon */}
        <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "rgba(0, 80, 158, 0.1)" }} />
      </div>
    </header>
  );
};

export default Header;
