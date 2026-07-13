import { Link } from "react-router-dom";
import tailwindLogo from "../assets/tailwind-logo.png";
import SolicitarAccesoForm from "../components/SolicitarAccesoForm";

export default function SolicitarAcceso() {
  return (
    <div className="access-page">
      <div className="access-card">
        <img src={tailwindLogo} alt="Tailwind Global Commerce" className="access-logo" />
        <h1>Solicitar acceso</h1>
        <p className="lead">
          La plataforma Tailwind es de uso interno. Dejanos tus datos y te contactamos por
          mail para darte de alta.
        </p>
        <SolicitarAccesoForm />
        <Link className="access-back" to="/login">
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
