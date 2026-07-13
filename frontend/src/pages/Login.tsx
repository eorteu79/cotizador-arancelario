import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import tailwindLogo from "../assets/tailwind-logo.png";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const { session, loading: sessionLoading } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (!sessionLoading && session) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from?.pathname ?? "/cotizador"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleLogin() {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGoogleSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={tailwindLogo} alt="Tailwind Global Commerce" className="login-logo" />
        <h1>Iniciar sesión</h1>

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
          <div className="login-password-wrap">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18" />
                  <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
                  <path d="M6.6 6.62C4.14 8.14 2 12 2 12s3.5 7 10 7c1.86 0 3.44-.56 4.74-1.34M17.8 17.8C19.94 16.13 22 12 22 12s-3.5-7-10-7c-.62 0-1.2.05-1.76.14" />
                </svg>
              )}
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Procesando..." : "Iniciar sesión"}
          </button>
        </form>

        <div className="login-divider">
          <span>o</span>
        </div>

        <button
          type="button"
          className="btn-google"
          onClick={onGoogleLogin}
          disabled={googleSubmitting}
        >
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
            />
          </svg>
          {googleSubmitting ? "Redirigiendo..." : "Continuar con Google"}
        </button>

        <div className="login-signup-hint">
          <span>¿Todavía no tenés acceso?</span>
          <Link className="btn btn-secondary" to="/solicitar-acceso">
            Solicitar acceso
          </Link>
        </div>
      </div>
    </div>
  );
}
