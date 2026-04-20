import { NavLink, useParams } from "react-router-dom";
import { getMarinaNameCB } from "../../lib/marinas";

const Header = () => {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  return (
    <header className="app-header glass">
      <div className="header-brand">
        <h1>
          Dock<span className="accent">Pulse</span>
        </h1>
        <span className="header-subtitle">{marinaName.toLowerCase()}</span>
      </div>

      <nav className="header-nav">
        <ul>
          <li>
            <NavLink
              to={`/${marinaSlug || "saltsjobaden"}`}
              className={function getClassNameCB({ isActive }) {
                return isActive ? "active" : "";
              }}
            >
              Dashboard
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="header-actions">
        {/* Placeholder for user profile or settings icon */}
        <div className="header-profile-placeholder" />
      </div>
    </header>
  );
};

export default Header;
