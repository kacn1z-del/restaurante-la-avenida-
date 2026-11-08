import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "./firebase.js";

function Diagnostico() {
  const [lineas, setLineas] = useState(["Iniciando diagnóstico..."]);

  useEffect(() => {
    const add = (t) => setLineas((l) => [...l, t]);
    add("Proyecto: " + import.meta.env.VITE_FIREBASE_PROJECT_ID);

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        add("No hay sesión activa. Entrá primero desde la app.");
        return;
      }
      add("Correo: " + user.email);
      add("UID: " + user.uid);

      try {
        const timeout = new Promise((_, rej) =>
          setTimeout(() => rej(new Error("sin respuesta del servidor en 10 s")), 10000)
        );
        const snap = await Promise.race([
          getDocFromServer(doc(db, "staff", user.uid)),
          timeout,
        ]);
        add("El servidor respondió. Documento existe: " + snap.exists());
        add("Datos: " + JSON.stringify(snap.data() || null));
      } catch (e) {
        add("Error: " + (e.code || "") + " " + e.message);
      }
    });

    return unsub;
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif", wordBreak: "break-all" }}>
      {lineas.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Diagnostico />);
