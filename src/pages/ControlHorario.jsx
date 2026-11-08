import { useEffect, useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, leerDoc, nuevoIdDoc, usePolling } from "../lib/api.js";
import { ROL } from "../lib/constants.js";
import { horaCorta } from "../lib/format.js";
import Personal from "./Personal.jsx";

// Las siete opciones del módulo. "soloAdmin" marca las que solo ve el director.
const OPCIONES = [
  { id: "fichar", label: "Fichar entrada / salida" },
  { id: "horarios", label: "Listado de horarios por empleado" },
  { id: "obs-nueva", label: "Nueva observación del empleado" },
  { id: "obs-ver", label: "Ver observaciones del empleado" },
  { id: "dir-nueva", label: "Nueva observación del director", soloAdmin: true },
  { id: "dir-ver", label: "Ver observaciones del director", soloAdmin: true },
  { id: "activacion", label: "Activación del módulo", soloAdmin: true },
];

const hoyIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const primerDiaMes = () => hoyIso().slice(0, 8) + "01";
const nombreCompleto = (e) => `${e.nombre || ""} ${e.apellidos || ""}`.trim();
const enRango = (fecha, d0, d1) => fecha instanceof Date && fecha >= d0 && fecha <= d1;
const fechaCorta = (f) => (f instanceof Date ? f.toLocaleDateString("es-CR") : "—");

function duracion(ms) {
  const minutos = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`;
}

// Une cada entrada con su salida siguiente. Una entrada sin salida queda "Abierta".
function emparejar(fichajes) {
  const filas = [];
  let abierta = null;
  for (const f of fichajes) {
    if (f.tipo === "entrada") {
      if (abierta) filas.push({ entrada: abierta.fecha, salida: null });
      abierta = f;
    } else if (f.tipo === "salida") {
      if (abierta) {
        filas.push({ entrada: abierta.fecha, salida: f.fecha });
        abierta = null;
      } else {
        filas.push({ entrada: null, salida: f.fecha });
      }
    }
  }
  if (abierta) filas.push({ entrada: abierta.fecha, salida: null });
  return filas;
}

function useEmpleados() {
  return usePolling(() => consultar("empleados", { orden: [["numeroEmpleado"]] }), [], 60000);
}

function SelectorEmpleado({ empleados, valor, onCambiar, conTodos = false }) {
  return (
    <select value={valor} onChange={(e) => onCambiar(e.target.value)}>
      <option value="">{conTodos ? "Todos los empleados" : "Elegí un empleado"}</option>
      {empleados.map((e) => (
        <option key={e.id} value={e.id}>#{e.numeroEmpleado} {nombreCompleto(e)}</option>
      ))}
    </select>
  );
}

// Opción 2: entradas y salidas de un empleado en un rango de fechas, con horas trabajadas
function Horarios({ empleadosQ }) {
  const empleados = empleadosQ.datos || [];
  const [empleadoId, setEmpleadoId] = useState("");
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyIso());
  const [filas, setFilas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function generar() {
    setError("");
    if (!empleadoId) return setError("Elegí un empleado.");
    setCargando(true);
    try {
      const d0 = new Date(desde + "T00:00:00");
      const d1 = new Date(hasta + "T23:59:59.999");
      const recientes = await consultar("fichajes", { orden: [["fecha", "desc"]], limite: 2000 });
      const propios = recientes
        .filter((f) => f.empleadoId === empleadoId && enRango(f.fecha, d0, d1))
        .sort((a, b) => a.fecha - b.fecha);
      setFilas(emparejar(propios));
    } catch (e) {
      setError("No se pudieron cargar los fichajes: " + e.message);
    } finally {
      setCargando(false);
    }
  }

  const totalMs = (filas || []).reduce(
    (suma, f) => (f.entrada && f.salida ? suma + (f.salida - f.entrada) : suma),
    0
  );

  return (
    <div className="card">
      <h3>Listado de horarios por empleado</h3>
      <div className="formulario">
        <SelectorEmpleado empleados={empleados} valor={empleadoId} onCambiar={setEmpleadoId} />
        <label>
          <span className="check">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          <span className="check">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>
      <button className="btn primary bloque" disabled={cargando} onClick={generar}>
        {cargando ? "Cargando..." : "Generar listado"}
      </button>
      {error && <p className="error">{error}</p>}

      {filas && filas.length === 0 && <p style={{ marginTop: 12 }}>No hay fichajes en este rango.</p>}
      {filas && filas.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>{fechaCorta(f.entrada || f.salida)}</td>
                  <td>{f.entrada ? horaCorta(f.entrada) : "—"}</td>
                  <td>{f.salida ? horaCorta(f.salida) : "Abierta"}</td>
                  <td>{f.entrada && f.salida ? duracion(f.salida - f.entrada) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}><strong>Total: {duracion(totalMs)}</strong></p>
        </div>
      )}
    </div>
  );
}

// Opciones 3 y 5: escribir una observación sobre un empleado
function ObservacionNueva({ coleccion, staff, empleadosQ }) {
  const empleados = empleadosQ.datos || [];
  const [empleadoId, setEmpleadoId] = useState("");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });

  async function guardar() {
    setMensaje({ tipo: "", texto: "" });
    const emp = empleados.find((e) => e.id === empleadoId);
    if (!emp) return setMensaje({ tipo: "error", texto: "Elegí un empleado." });
    if (!texto.trim()) return setMensaje({ tipo: "error", texto: "Escribí la observación." });

    setGuardando(true);
    try {
      await confirmar([
        crear(coleccion, nuevoIdDoc(), {
          empleadoId: emp.id,
          empleadoNombre: nombreCompleto(emp),
          texto: texto.trim(),
          autorNombre: staff?.nombre || "Personal",
          autorUid: staff?.uid || null,
          creadoEn: ahora(),
        }),
      ]);
      setTexto("");
      setMensaje({ tipo: "ok", texto: "Observación guardada." });
    } catch (e) {
      setMensaje({ tipo: "error", texto: "No se pudo guardar: " + e.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <h3>Nueva observación</h3>
      <div className="formulario">
        <SelectorEmpleado empleados={empleados} valor={empleadoId} onCambiar={setEmpleadoId} />
        <textarea
          rows={3}
          placeholder="Escribí la observación"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      <button className="btn primary bloque" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar observación"}
      </button>
      {mensaje.texto && <p className={mensaje.tipo === "ok" ? "ok" : "error"}>{mensaje.texto}</p>}
    </div>
  );
}

// Opciones 4 y 6: leer observaciones, con filtro por empleado
function ObservacionesVer({ coleccion, empleadosQ }) {
  const empleados = empleadosQ.datos || [];
  const [empleadoId, setEmpleadoId] = useState("");
  const obsQ = usePolling(
    () => consultar(coleccion, { orden: [["creadoEn", "desc"]], limite: 200 }),
    [coleccion],
    20000
  );
  const lista = (obsQ.datos || []).filter((o) => !empleadoId || o.empleadoId === empleadoId);

  return (
    <div className="card">
      <h3>Observaciones</h3>
      <div className="formulario">
        <SelectorEmpleado empleados={empleados} valor={empleadoId} onCambiar={setEmpleadoId} conTodos />
      </div>
      {obsQ.error && <p className="error">{obsQ.error}</p>}
      {obsQ.datos && lista.length === 0 && <p>No hay observaciones.</p>}
      {lista.map((o) => (
        <div key={o.id} className="item">
          <div className="item-linea">
            <span>{fechaCorta(o.creadoEn)} {horaCorta(o.creadoEn)} · {o.empleadoNombre || "—"}</span>
          </div>
          <p style={{ margin: "4px 0" }}>{o.texto}</p>
          <small>Por {o.autorNombre || "—"}</small>
        </div>
      ))}
    </div>
  );
}

// Opción 7: encender o apagar el fichaje. Se guarda en configuracion/controlHorario
function Activacion() {
  const [activo, setActivo] = useState(null);
  const [existe, setExiste] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });

  useEffect(() => {
    leerDoc("configuracion", "controlHorario")
      .then((d) => {
        setExiste(!!d);
        setActivo(d ? d.activo !== false : true);
      })
      .catch((e) => setMensaje({ tipo: "error", texto: "No se pudo leer: " + e.message }));
  }, []);

  async function cambiar() {
    const nuevo = !activo;
    setGuardando(true);
    setMensaje({ tipo: "", texto: "" });
    try {
      const escritura = existe
        ? actualizar("configuracion", "controlHorario", { activo: nuevo })
        : crear("configuracion", "controlHorario", { activo: nuevo });
      await confirmar([escritura]);
      setExiste(true);
      setActivo(nuevo);
      setMensaje({ tipo: "ok", texto: nuevo ? "Módulo activado." : "Módulo desactivado." });
    } catch (e) {
      setMensaje({ tipo: "error", texto: "No se pudo cambiar: " + e.message });
    } finally {
      setGuardando(false);
    }
  }

  if (activo === null) return <p>Cargando...</p>;

  return (
    <div className="card">
      <h3>Activación del módulo</h3>
      <p>Estado: <strong>{activo ? "Activo" : "Desactivado"}</strong></p>
      <p>Con el módulo desactivado nadie puede fichar. Los historiales y las observaciones se conservan. El respaldo de datos está en Mantenimiento.</p>
      <button className={"btn bloque " + (activo ? "peligro" : "primary")} disabled={guardando} onClick={cambiar}>
        {activo ? "Desactivar módulo" : "Activar módulo"}
      </button>
      {mensaje.texto && <p className={mensaje.tipo === "ok" ? "ok" : "error"}>{mensaje.texto}</p>}
    </div>
  );
}

export default function ControlHorario({ staff }) {
  const esAdmin = staff?.rol === ROL.ADMIN;
  const [opcion, setOpcion] = useState(null);
  const [activo, setActivo] = useState(true);
  const empleadosQ = useEmpleados();

  // Se vuelve a leer al cambiar de opción para que el fichaje refleje la última activación
  useEffect(() => {
    leerDoc("configuracion", "controlHorario")
      .then((d) => setActivo(d ? d.activo !== false : true))
      .catch(() => {});
  }, [opcion]);

  const visibles = OPCIONES.map((o, i) => ({ ...o, numero: i + 1 })).filter((o) => !o.soloAdmin || esAdmin);

  return (
    <section className="stack">
      <div>
        <h2>Control horario</h2>
        <p>{opcion ? visibles.find((o) => o.id === opcion)?.label : "Elegí una opción."}</p>
      </div>

      {!opcion && (
        <div className="card stack">
          {visibles.map((o) => (
            <button key={o.id} className="btn bloque" onClick={() => setOpcion(o.id)}>
              {o.numero}. {o.label}
            </button>
          ))}
        </div>
      )}

      {opcion && (
        <>
          <button className="btn" onClick={() => setOpcion(null)}>← Volver al menú</button>

          {opcion === "fichar" &&
            (activo ? (
              <Personal staff={staff} />
            ) : (
              <div className="card">
                <p className="error">El módulo está desactivado. El admin lo puede activar en la opción 7.</p>
              </div>
            ))}
          {opcion === "horarios" && <Horarios empleadosQ={empleadosQ} />}
          {opcion === "obs-nueva" && (
            <ObservacionNueva coleccion="observacionesEmpleado" staff={staff} empleadosQ={empleadosQ} />
          )}
          {opcion === "obs-ver" && (
            <ObservacionesVer coleccion="observacionesEmpleado" empleadosQ={empleadosQ} />
          )}
          {opcion === "dir-nueva" && esAdmin && (
            <ObservacionNueva coleccion="observacionesDirector" staff={staff} empleadosQ={empleadosQ} />
          )}
          {opcion === "dir-ver" && esAdmin && (
            <ObservacionesVer coleccion="observacionesDirector" empleadosQ={empleadosQ} />
          )}
          {opcion === "activacion" && esAdmin && <Activacion />}
        </>
      )}
    </section>
  );
}
