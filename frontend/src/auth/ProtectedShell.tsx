import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import tailwindLogo from "../assets/tailwind-logo-header.png";
import { modules } from "../modules/registry";
import { useAuth } from "./useAuth";

export default function ProtectedShell() {
  const { session, loading, user, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="shell-loading">Cargando...</div>;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="shell">
      <nav className="shell-nav">
        <div className="shell-nav-brand">
          <img src={tailwindLogo} alt="Tailwind Global Commerce" className="shell-logoimg" />
        </div>
        <div className="shell-nav-links">
          {modules.map((m) => (
            <NavLink
              key={m.path}
              to={m.path}
              className={({ isActive }) => `shell-nav-link ${isActive ? "active" : ""}`}
            >
              {m.label}
            </NavLink>
          ))}
        </div>
        <div className="shell-nav-user">
          <span className="shell-nav-email">{user?.email}</span>
          <button className="shell-nav-signout" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </nav>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
