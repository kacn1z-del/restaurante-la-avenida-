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
import Resumen from "./pages/Resumen.jsx";
import Pedidos from "./pages/Pedidos.jsx";

const VISTAS = {
  resumen: { label: "Resumen", icono: "◔", roles: [ROL.ADMIN] },
  salon: { label: "Salón", icono: "⛶", roles: [ROL.ADMIN, ROL.MESERO, ROL.CAJA] },
  pedidos: { label: "Pedidos", icono: "☰", roles: [ROL.ADMIN, ROL.MESERO, ROL.CAJA] },
  cocina: { label: "Cocina / Barra", icono: "◉", roles: [ROL.ADMIN, ROL.COCINA, ROL.BARRA] },
  caja: { label: "Caja", icono: "₡", roles: [ROL.ADMIN, ROL.CAJA] },
  productos: { label: "Menú", icono: "🍽", roles: [ROL.ADMIN] },
  compras: { label: "Compras", icono: "🧾", roles: [ROL.ADMIN] },
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
        <div className="sidebar__brand" style={{ justifyContent: "center", padding: 0 }}>
          <span className="sidebar__mark">LA</span>
        </div>
        <h1>La Avenida</h1>
        <p>Ingresá con tu cuenta del POS.</p>
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
        <button className="btn primary bloque" disabled={cargando}>
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
        <p style={{ fontSize: 13, wordBreak: "break-all" }}>
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
        <button className="btn bloque" onClick={onSalir}>Salir</button>
      </div>
    </div>
  );
}

function Pantalla({ children }) {
  return <div className="login"><div className="card login-card">{children}</div></div>;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = todavía cargando
  const [vista, setVista] = useState("resumen");
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

  if (user === undefined) {
    return <div className="login"><p>Cargando...</p></div>;
  }
  if (!user) return <Login />;

  const perfil = perfilQ.datos;
  if (!perfil) {
    return (
      <Pantalla>
        {perfilQ.error ? (
          <>
            <p className="error">No se pudo leer tu perfil:</p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{perfilQ.error}</pre>
          </>
        ) : (
          <p>Cargando perfil...</p>
        )}
        <button className="btn bloque" onClick={() => signOut(auth)}>Salir</button>
      </Pantalla>
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
    return <Comanda pedidoId={pedidoActivo.pedidoId} onVolver={volver} staff={staff} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__mark">LA</span>
          <div>
            <div className="sidebar__title">La Avenida</div>
            <div className="sidebar__subtitle">POS Restaurante</div>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Secciones">
          {vistasPermitidas.map(([id, v]) => (
            <button
              key={id}
              className={"sidebar__link" + (vistaActual === id ? " is-active" : "")}
              aria-current={vistaActual === id ? "page" : undefined}
              onClick={() => setVista(id)}
            >
              <span className="sidebar__icon">{v.icono}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </nav>

        <footer className="sidebar__footer">
          <p>Conectado como</p>
          <p className="sidebar__project">{user.email}</p>
          <button className="btn" onClick={() => signOut(auth)}>Cerrar sesión</button>
        </footer>
      </aside>

      <main className="app-main">
        <div className="contenido stack">
          {vistaActual === "resumen" && <Resumen />}
          {vistaActual === "salon" && (
            <Salon staff={staff} onAbrirPedido={(p) => setPedidoActivo(p)} />
          )}
          {vistaActual === "pedidos" && (
            <Pedidos onAbrirPedido={(p) => setPedidoActivo(p)} />
          )}
          {vistaActual === "cocina" && <Cocina zonas={ZONAS_POR_ROL[staff.rol] || []} />}
          {vistaActual === "caja" && <Caja staff={staff} />}
          {vistaActual === "productos" && <Productos />}
          {vistaActual === "compras" && <Compras staff={staff} />}
        </div>
      </main>
    </div>
  );
}
