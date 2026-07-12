import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedShell from "./auth/ProtectedShell";
import { modules } from "./modules/registry";
import Login from "./pages/Login";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<Navigate to="/cotizador" replace />} />
        {modules.map((m) => (
          // Nested route paths are relative to the parent (pathless) route,
          // so the registry's leading "/" (used for absolute NavLink targets)
          // is stripped here.
          <Route key={m.path} path={m.path.replace(/^\//, "")} element={m.element} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
