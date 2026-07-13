import { useState, type FormEvent } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FORM_ACTION = import.meta.env.VITE_ACCESS_FORM_ACTION;
const FIELD_NOMBRE = import.meta.env.VITE_ACCESS_FORM_NOMBRE;
const FIELD_EMAIL = import.meta.env.VITE_ACCESS_FORM_EMAIL;
const FIELD_TELEFONO = import.meta.env.VITE_ACCESS_FORM_TELEFONO;
const FIELD_EMPRESA = import.meta.env.VITE_ACCESS_FORM_EMPRESA;

interface SolicitarAccesoFormProps {
  initialNombre?: string;
  initialEmail?: string;
}

export default function SolicitarAccesoForm({
  initialNombre = "",
  initialEmail = "",
}: SolicitarAccesoFormProps) {
  const [nombre, setNombre] = useState(initialNombre);
  const [email, setEmail] = useState(initialEmail);
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim() || !email.trim() || !telefono.trim() || !empresa.trim()) {
      setError("Completá todos los campos.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Ingresá un email válido.");
      return;
    }

    setSubmitting(true);
    try {
      await fetch(FORM_ACTION, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          [FIELD_NOMBRE]: nombre.trim(),
          [FIELD_EMAIL]: email.trim(),
          [FIELD_TELEFONO]: telefono.trim(),
          [FIELD_EMPRESA]: empresa.trim(),
        }),
      });
      setSent(true);
    } catch {
      setError("No pudimos enviar la solicitud. Probá de nuevo en un momento.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="alert alert-warning">
        ¡Listo! Recibimos tu solicitud. Te vamos a contactar por mail para darte el acceso.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="solicitud-nombre">Nombre</label>
      <input
        id="solicitud-nombre"
        type="text"
        autoComplete="name"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />

      <label htmlFor="solicitud-email">Email</label>
      <input
        id="solicitud-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="solicitud-telefono">Teléfono</label>
      <input
        id="solicitud-telefono"
        type="tel"
        autoComplete="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        required
      />

      <label htmlFor="solicitud-empresa">Empresa</label>
      <input
        id="solicitud-empresa"
        type="text"
        autoComplete="organization"
        value={empresa}
        onChange={(e) => setEmpresa(e.target.value)}
        required
      />

      {error && <div className="alert alert-error">{error}</div>}

      <button className="btn" type="submit" disabled={submitting}>
        {submitting ? "Enviando..." : "Solicitar acceso"}
      </button>
    </form>
  );
}
