import { useEffect, useState } from "react";
import { useRole } from "../../auth/useRole";
import { asignarRol, deleteAcceso, listAcceso, listUsuarios, quitarRol, upsertAcceso } from "./api";
import type { AccesoOut, UsuarioOut } from "./types";

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsuarios() {
  const { role: myRole } = useRole();
  const isSuperadmin = myRole === "superadmin";

  const [usuarios, setUsuarios] = useState<UsuarioOut[] | null>(null);
  const [acceso, setAcceso] = useState<AccesoOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function reload() {
    Promise.all([listUsuarios(), listAcceso()])
      .then(([u, a]) => {
        setUsuarios(u.items);
        setAcceso(a.items);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(reload, []);

  const accesoByEmail = new Map((acceso ?? []).map((a) => [a.email.toLowerCase(), a]));

  async function onSetAcceso(email: string, permitido: boolean) {
    setBusyEmail(email);
    setActionError(null);
    try {
      await upsertAcceso(email, permitido);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyEmail(null);
    }
  }

  async function onQuitarRegla(email: string) {
    setBusyEmail(email);
    setActionError(null);
    try {
      await deleteAcceso(email);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyEmail(null);
    }
  }

  async function onCambiarRol(email: string, nuevoRol: "usuario" | "admin" | "superadmin") {
    const msg =
      nuevoRol === "usuario"
        ? `¿Quitarle el rol de administración a ${email}?`
        : `¿Asignarle el rol '${nuevoRol}' a ${email}?`;
    if (!window.confirm(msg)) return;
    setBusyEmail(email);
    setActionError(null);
    try {
      if (nuevoRol === "usuario") {
        await quitarRol(email);
      } else {
        await asignarRol(email, nuevoRol);
      }
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyEmail(null);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!usuarios) {
    return (
      <div className="loader">
        <div className="spinner" />
        <span>Cargando usuarios...</span>
      </div>
    );
  }

  return (
    <div>
      {actionError && <div className="alert alert-error">{actionError}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="sec-h" style={{ padding: "20px 20px 0" }}>
          <span className="n">01</span>
          <h2>Usuarios ({usuarios.length})</h2>
        </div>
        <table className="cost-table" style={{ padding: "0 20px 20px" }}>
          <thead>
            <tr>
              <td style={{ fontWeight: 700 }}>Email</td>
              <td style={{ fontWeight: 700 }}>Alta</td>
              <td style={{ fontWeight: 700 }}>Último acceso</td>
              <td style={{ fontWeight: 700 }}>Rol</td>
              <td style={{ fontWeight: 700 }}>Acceso</td>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const email = (u.email ?? "").toLowerCase();
              const reglaAcceso = accesoByEmail.get(email);
              const busy = busyEmail === email;
              return (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{fmtFecha(u.created_at)}</td>
                  <td>{fmtFecha(u.last_sign_in_at)}</td>
                  <td>
                    {isSuperadmin ? (
                      <select
                        value={u.role ?? "usuario"}
                        disabled={busy}
                        onChange={(e) =>
                          onCambiarRol(email, e.target.value as "usuario" | "admin" | "superadmin")
                        }
                      >
                        <option value="usuario">Usuario</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    ) : (
                      u.role ?? "usuario"
                    )}
                  </td>
                  <td>
                    <div className="row gap8 wrapf">
                      {reglaAcceso ? (
                        <span className={reglaAcceso.permitido ? "src-tag src-base" : "src-tag src-verificar"}>
                          {reglaAcceso.permitido ? "Allow" : "Deny"}
                        </span>
                      ) : (
                        <span className="hint" style={{ margin: 0 }}>
                          Según dominio
                        </span>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ flex: "0 0 auto", padding: "6px 10px", fontSize: 10 }}
                        disabled={busy}
                        onClick={() => onSetAcceso(email, true)}
                      >
                        Allow
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ flex: "0 0 auto", padding: "6px 10px", fontSize: 10 }}
                        disabled={busy}
                        onClick={() => onSetAcceso(email, false)}
                      >
                        Deny
                      </button>
                      {reglaAcceso && (
                        <button
                          className="btn btn-secondary"
                          style={{ flex: "0 0 auto", padding: "6px 10px", fontSize: 10 }}
                          disabled={busy}
                          onClick={() => onQuitarRegla(email)}
                        >
                          Quitar regla
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
