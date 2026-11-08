import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";

function conTiempo(promesa, ms, nombre) {
  return Promise.race([
    promesa,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${nombre}: sin respuesta en ${ms / 1000} s`)), ms)
    ),
  ]);
}

function Diagnostico() {
  const [lineas, setLineas] = useState(["Iniciando diagnóstico..."]);

  useEffect(() => {
    const add = (t) => setLineas((l) => [...l, t]);
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    add("Proyecto: " + projectId);

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        add("No hay sesión. Entrá primero desde la app.");
        return;
      }
      add("UID: " + user.uid);

      let token;
      try {
        token = await conTiempo(user.getIdToken(true), 10000, "getIdToken");
        add("1) Token obtenido: sí (" + token.length + " caracteres)");
      } catch (e) {
        add("1) Token: " + e.message);
        return;
      }

      try {
        const url =
          `https://firestore.googleapis.com/v1/projects/${projectId}` +
          `/databases/(default)/documents/staff/${user.uid}?key=${apiKey}`;
        const r = await conTiempo(
          fetch(url, { headers: { Authorization: "Bearer " + token } }),
          10000,
          "fetch"
        );
        const texto = await r.text();
        add("2) Firestore por HTTP: código " + r.status);
        add("Respuesta: " + texto.slice(0, 600));
      } catch (e) {
        add("2) Firestore por HTTP: " + e.message);
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
