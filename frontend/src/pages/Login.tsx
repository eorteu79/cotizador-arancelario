import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import tailwindLogo from "../assets/tailwind-logo.png";
import { supabase } from "../lib/supabaseClient";

type Mode = "signin" | "signup";

export default function Login() {
  const { session, loading: sessionLoading } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!sessionLoading && session) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from?.pathname ?? "/cotizador"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo(
          "Cuenta creada. Si tu proyecto Supabase requiere confirmación por email, revisá tu " +
            "casilla antes de iniciar sesión."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={tailwindLogo} alt="Tailwind Global Commerce" className="login-logo" />
        <h1>{mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}</h1>

        <form onSubmit={onSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <div className="alert alert-error">{error}</div>}
          {info && <div className="alert alert-warning">{info}</div>}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting
              ? "Procesando..."
              : mode === "signin"
              ? "Iniciar sesión"
              : "Crear cuenta"}
          </button>
        </form>

        <button
          className="login-switch"
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signin"
            ? "¿No tenés cuenta? Registrate"
            : "¿Ya tenés cuenta? Iniciá sesión"}
        </button>
      </div>
    </div>
  );
}
