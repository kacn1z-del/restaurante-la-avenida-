import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { ROL } from "./lib/constants.js";
import Salon from "./pages/Salon.jsx";
import Comanda from "./pages/Comanda.jsx";
import Cocina from "./pages/Cocina.jsx";
import Caja from "./pages/Caja.jsx";
import Productos from "./pages/Productos.jsx";

const VISTAS = {
  salon: { label: "Salón", roles: [ROL.ADMIN, ROL.MESERO, ROL.CAJA] },
  cocina: { label: "Cocina / Barra", roles: [ROL.ADMIN, ROL.COCINA, ROL.BARRA] },
  caja: { label: "Caja", roles: [ROL.ADMIN, ROL.CAJA] },
  productos: { label: "Productos", roles: [ROL.ADMIN] },
};

// Qué zonas ve cada rol en la pantalla de cocina
const ZONAS_POR_ROL = {
  [ROL.COCINA]: ["cocina"],
  [ROL.BARRA]: ["barra"],
  [ROL.ADMIN]: ["cocina", "barra"],
};

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err) {
      setError("No se pudo entrar: " + (err.code || err.message));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={entrar}>
        <h1>POS Restaurante</h1>
        <input
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={cargando}>
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = todavía cargando
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState("");
  const [vista, setVista] = useState("salon");
  const [pedidoActivo, setPedidoActivo] = useState(null); // { pedidoId, mesaNumero }

  // Estable para que Comanda no se vuelva a suscribir en cada render
  const volver = useCallback(() => setPedidoActivo(null), []);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) {
      setStaff(null);
      setStaffError("");
      return undefined;
    }
    return onSnapshot(
      doc(db, "staff", user.uid),
      (snap) => {
        setStaffError("");
        setStaff(
          snap.exists()
            ? { uid: user.uid, ...snap.data() }
            : { uid: user.uid, sinPerfil: true }
        );
      },
      (err) => {
        setStaffError(`${err.code || "error"}: ${err.message}`);
      }
    );
  }, [user]);

  if (user === undefined) return <div className="login"><p>Cargando...</p></div>;
  if (!user) return <Login />;

  if (!staff) {
    return (
      <div className="login">
        <div className="card login-card">
          {staffError ? (
            <>
              <p className="error">No se pudo leer tu perfil de Firestore:</p>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{staffError}</pre>
            </>
          ) : (
            <p>Cargando perfil...</p>
          )}
          <button className="btn" onClick={() => signOut(auth)}>Salir</button>
        </div>
      </div>
    );
  }

  if (staff.sinPerfil || staff.activo === false) {
    return (
      <div className="login">
        <div className="card login-card">
          <p>Tu usuario no tiene permisos. Pedí acceso al administrador.</p>
          <button className="btn" onClick={() => signOut(auth)}>Salir</button>
        </div>
      </div>
    );
  }

  const vistasPermitidas = Object.entries(VISTAS).filter(([, v]) => v.roles.includes(staff.rol));
  const vistaActual = vistasPermitidas.some(([id]) => id === vista)
    ? vista
    : vistasPermitidas[0]?.[0];

  if (pedidoActivo) {
    return <Comanda pedidoId={pedidoActivo.pedidoId} onVolver={volver} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>POS Restaurante</strong>
        <nav>
          {vistasPermitidas.map(([id, v]) => (
            <button
              key={id}
              className={"tab" + (vistaActual === id ? " activo" : "")}
              onClick={() => setVista(id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <button className="btn" onClick={() => signOut(auth)}>Salir</button>
      </header>

      <main className="contenido">
        {vistaActual === "salon" && (
          <Salon staff={staff} onAbrirPedido={(p) => setPedidoActivo(p)} />
        )}
        {vistaActual === "cocina" && <Cocina zonas={ZONAS_POR_ROL[staff.rol] || []} />}
        {vistaActual === "caja" && <Caja staff={staff} />}
        {vistaActual === "productos" && <Productos />}
      </main>
    </div>
  );
}
