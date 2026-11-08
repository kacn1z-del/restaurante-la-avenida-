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
        
