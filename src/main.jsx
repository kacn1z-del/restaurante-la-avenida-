import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase.js";

function conLimite(promesa, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta en ${ms / 1000} s`)), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function Diagnostico() {
  const [user, setUser] = useState(undefined);
  const [log, setLog] = useState([]);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const agregar = (texto) => setLog((l) => [...l, texto]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return undefined;

    setLog([]);
    agregar(`Proyecto: ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`);
    agregar(`UID: ${user.uid}`);

    const ref = doc(db, "staff", user.uid);
    let quitar = () => {};
    let recibio = false;

    (async () => {
      const t0 = Date.now();
      try {
        await conLimite(getDocFromServer(ref));
        agregar(`getDocFromServer OK (${Date.now() - t0} ms)`);
      } catch (e) {
        agregar(`getDocFromServer ERROR: ${e.code || ""} ${e.message}`);
      }

      const t1 = Date.now();
      try {
        await conLimite(getDoc(ref));
        agregar(`getDoc OK (${Date.now() - t1} ms)`);
      } catch (e) {
        agregar(`getDoc ERROR: ${e.code || ""} ${e.message}`);
      }

      const t2 = Date.now();
      quitar = onSnapshot(
        ref,
        (snap) => {
          recibio = true;
          agregar(
            `onSnapshot evento: existe=${snap.exists()}, desde caché=${snap.metadata.fromCache} (${Date.now() - t2} ms)`
          );
        },
        (e) => {
          recibio = true;
          agregar(`onSnapshot ERROR: ${e.code || ""} ${e.message}`);
        }
      );

      setTimeout(() => {
        if (!recibio) agregar("onSnapshot: sin evento a los 8 s");
      }, 8000);
    })();

    return () => quitar();
  }, [user]);

  async function entrar(e) {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err) {
      setError(err.code || err.message);
    }
  }

  if (user === undefined) return <p style={{ padding: 20 }}>Cargando...</p>;

  if (!user) {
    return (
      <form onSubmit={entrar} style={{ padding: 20, display: "grid", gap: 10 }}>
        <h2>Diagnóstico Firestore</h2>
        <input placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Contraseña"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button>Entrar</button>
      </form>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h2>Diagnóstico Firestore</h2>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14 }}>
        {log.join("\n")}
      </pre>
      <button onClick={() => signOut(auth)}>Salir</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Diagnostico />);
