import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const REQUERIDAS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const raiz = ReactDOM.createRoot(document.getElementById("root"));

function Pantalla({ titulo, detalle }) {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
      <h2>{titulo}</h2>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#fee2e2",
          color: "#7f1d1d",
          padding: 12,
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        {detalle}
      </pre>
    </div>
  );
}

class ErrorLimite extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <Pantalla
          titulo="Error al mostrar la app"
          detalle={`${e?.message || String(e)}\n\n${e?.stack || ""}`}
        />
      );
    }
    return this.props.children;
  }
}

const faltan = REQUERIDAS.filter((k) => !import.meta.env[k]);

if (faltan.length) {
  raiz.render(
    <Pantalla
      titulo="Faltan variables de entorno en Vercel"
      detalle={
        "Agregalas en Settings → Environment Variables y luego hacé Redeploy:\n\n" +
        faltan.join("\n")
      }
    />
  );
} else {
  import("./App.jsx")
    .then(({ default: App }) => {
      raiz.render(
        <React.StrictMode>
          <ErrorLimite>
            <App />
          </ErrorLimite>
        </React.StrictMode>
      );
    })
    .catch((e) => {
      raiz.render(
        <Pantalla
          titulo="Error al cargar la app"
          detalle={`${e?.message || String(e)}\n\n${e?.stack || ""}`}
        />
      );
    });
}
