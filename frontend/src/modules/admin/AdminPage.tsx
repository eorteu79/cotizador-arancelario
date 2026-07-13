import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useRole } from "../../auth/useRole";
import AdminAranceles from "./AdminAranceles";
import AdminPrompt from "./AdminPrompt";
import AdminUsuarios from "./AdminUsuarios";

type Tab = "aranceles" | "prompt" | "usuarios";

export default function AdminPage() {
  const { role, loading } = useRole();
  const [tab, setTab] = useState<Tab>("usuarios");

  if (loading) {
    return <div className="shell-loading">Cargando...</div>;
  }

  // Defensa en profundidad: el nav ya oculta este link a quien no es admin/
  // superadmin, pero la ruta /admin es alcanzable escribiendo la URL — cada
  // endpoint detrás vuelve a validar el rol en el backend de todos modos.
  if (role !== "admin" && role !== "superadmin") {
    return <Navigate to="/cotizador" replace />;
  }

  const isSuperadmin = role === "superadmin";

  return (
    <div className="app">
      <div className="header">
        <div className="eyebrow">Panel de administración</div>
        <h1>Administración de la plataforma</h1>
        <div className="goldrule" />
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "usuarios" ? "active" : ""}`} onClick={() => setTab("usuarios")}>
          Usuarios
        </button>
        {isSuperadmin && (
          <>
            <button
              className={`tab ${tab === "aranceles" ? "active" : ""}`}
              onClick={() => setTab("aranceles")}
            >
              Aranceles
            </button>
            <button className={`tab ${tab === "prompt" ? "active" : ""}`} onClick={() => setTab("prompt")}>
              Prompt Gemini
            </button>
          </>
        )}
      </div>

      {tab === "usuarios" && <AdminUsuarios />}
      {tab === "aranceles" && isSuperadmin && <AdminAranceles />}
      {tab === "prompt" && isSuperadmin && <AdminPrompt />}
    </div>
  );
}
