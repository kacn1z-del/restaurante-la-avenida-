import { useEffect, useState } from "react";
import { actualizar, confirmar, crear, leerDoc } from "../lib/api.js";
import { NEGOCIO_VACIO } from "../lib/negocio.js";

const CAMPOS = [
  { campo: "nombre", etiqueta: "Nombre del negocio", obligatorio: true },
  { campo: "direccion", etiqueta: "Dirección" },
  { campo: "cedulaJuridica", etiqueta: "Cédula jurídica" },
  { campo: "telefono", etiqueta: "Teléfono" },
  { campo: "leyenda", etiqueta: "Leyenda del ticket (pie de página)" },
];

// Datos del negocio que salen en tickets, precuentas y correos
export default function Configuracion() {
  const [form, setForm] = useState(NEGOCIO_VACIO);
  const [existe, setExiste] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    leerDoc("configuracion", "negocio")
      .then((datos) => {
        if (!datos) return;
        setExiste(true);
        setForm({
          nombre: datos.nombre ?? NEGOCIO_VACIO.nombre,
          direccion: datos.direccion ?? "",
          cedulaJuridica: datos.cedulaJuridica ?? "",
          telefono: datos.telefono ?? "",
          leyenda: datos.leyenda ?? NEGOCIO_VACIO.leyenda,
        });
      })
      .catch((e) => setError("No se pudo leer la configuración: " + e.message))
      .finally(() => setCargando(false));
  }, []);

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setMensaje("");
  }

  async function guardar() {
    setError("");
    setMensaje("");
    const datos = Object.fromEntries(CAMPOS.map(({ campo }) => [campo, String(form[campo] ?? "").trim()]));
    if (!datos.nombre) return setError("Poné el nombre del negocio.");

    setGuardando(true);
    try {
      const escritura = existe
        ? actualizar("configuracion", "negocio", datos)
        : crear("configuracion", "negocio", datos);
      await confirmar([escritura]);
      setExiste(true);
      setMensaje("Configuración guardada.");
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p>Cargando configuración...</p>;

  return (
    <section className="stack">
      <div>
        <h2>Configuración</h2>
        <p>Estos datos salen en los tickets, las precuentas y los correos.</p>
      </div>

      <div className="card">
        <div className="formulario">
          {CAMPOS.map(({ campo, etiqueta, obligatorio }) => (
            <label key={campo}>
              <span className="check">{etiqueta}{obligatorio ? " *" : ""}</span>
              {campo === "leyenda" ? (
                <textarea
                  rows={2}
                  value={form[campo]}
                  onChange={(e) => cambiar(campo, e.target.value)}
                />
              ) : (
                <input
                  value={form[campo]}
                  inputMode={campo === "telefono" || campo === "cedulaJuridica" ? "numeric" : undefined}
                  onChange={(e) => cambiar(campo, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        {mensaje && <p>{mensaje}</p>}

        <button className="btn primary bloque" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </section>
  );
}
