import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import tailwindLogo from "../assets/tailwind-logo.png";
import { clearPendingAccessInfo, readPendingAccessInfo } from "../auth/accessDenied";
import SolicitarAccesoForm from "../components/SolicitarAccesoForm";

export default function AccesoDenegado() {
  const [pending] = useState(() => readPendingAccessInfo());

  useEffect(() => {
    return () => clearPendingAccessInfo();
  }, []);

  return (
    <div className="access-page">
      <div className="access-card">
        <img src={tailwindLogo} alt="Tailwind Global Commerce" className="access-logo" />
        <h1>Acceso pendiente</h1>
        <p className="lead">
          Tu cuenta todavía no tiene acceso a la plataforma Tailwind. Dejanos tus datos y te
          habilitamos a la brevedad.
        </p>
        <SolicitarAccesoForm
          initialNombre={pending?.nombre ?? ""}
          initialEmail={pending?.email ?? ""}
        />
        <Link className="access-back" to="/login">
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
