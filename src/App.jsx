import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import { ROL } from "./lib/constants.js";
import { leerDoc, usePolling } from "./lib/api.js";
import Salon from "./pages/Salon.jsx";
import Comanda from "./pages/Comanda.jsx";
import Cocina from "./pages/Cocina.jsx";
import Caja from "./pages/Caja.jsx";
import Productos from "./pages/Productos.jsx";
import Compras from "./pages/Compras.jsx";

const VISTAS = {
  salon: { label: "Salón", roles: [ROL.ADMIN, ROL.MESERO, ROL.CAJA] },
  cocina: { label: "Cocina / Barra", roles: [ROL.ADMIN, ROL.COCINA, ROL.BARRA] },
  caja: { label: "Caja", roles: [ROL.ADMIN, ROL.CAJA] },
  productos: { label: "Productos", roles: [ROL.ADMIN] },
  compras: { label: "Compras", roles: [ROL.ADMIN] },
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

function SinPermiso({ user, info, onSalir }) {
  return (
    <div className="login">
      <div className="card login-card">
        <p>Tu usuario no tiene permisos. Pedí acceso al administrador.</p>
        <p style={{ fontSize: 12, wordBreak: "break-all" }}>
          <strong>Correo:</strong> {user.email}
          <br />
          <strong>UID:</strong> {user.uid}
          <br />
          <strong>Proyecto:</strong> {import.meta.env.VITE_FIREBASE_PROJECT_ID}
          <br />
          <strong>Documento encontrado:</strong> {info?.existe ? "sí" : "no"}
          <br />
          <strong>Datos:</strong> {info?.datos ? JSON.stringify(info.datos) : "ninguno"}
        </p>
        <button className="btn" onClick={onSalir}>Salir</button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = todavía cargando
  const [vista, setVista] = useState("salon");
  const [pedidoActivo, setPedidoActivo] = useState(null); // { pedidoId, mesaNumero }

  // Estable para que Comanda no se vuelva a suscribir en cada render
  const volver = useCallback(() => setPedidoActivo(null), []);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const uid = user?.uid;
  const perfilQ = usePolling(
    async () => {
      if (!uid) return null;
      const datos = await leerDoc("staff", uid);
      return { existe: !!datos, datos };
    },
    [uid],
    30000
  );

  if (user === undefined) return <div className="login"><p>Cargando...</p></div>;
  if (!user) return <Login />;

  const perfil = perfilQ.datos;
  if (!perfil) {
    return (
      <div className="login">
        <div className="card login-card">
          {perfilQ.error ? (
            <>
              <p className="error">No se pudo leer tu perfil:</p>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{perfilQ.error}</pre>
            </>
          ) : (
            <p>Cargando perfil...</p>
          )}
          <button className="btn" onClick={() => signOut(auth)}>Salir</button>
        </div>
      </div>
    );
  }

  const staff = perfil.existe
    ? { uid: user.uid, ...perfil.datos }
    : { uid: user.uid, sinPerfil: true };

  if (staff.sinPerfil || staff.activo === false) {
    return (
      <SinPermiso
        user={user}
        info={{ existe: perfil.existe, datos: perfil.datos }}
        onSalir={() => signOut(auth)}
      />
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
        {vistaActual === "compras" && <Compras staff={staff} />}
      </main>
    </div>
  );
}
