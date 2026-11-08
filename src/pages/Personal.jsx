import { useMemo, useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { ROL } from "../lib/constants.js";
import { horaCorta } from "../lib/format.js";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];

// Fichaje de entrada y salida con PIN, historial y, para el admin, asignación de PIN
export default function Personal({ staff }) {
  const esAdmin = staff?.rol === ROL.ADMIN;
  const [tipo, setTipo] = useState("entrada");
  const [seleccionado, setSeleccionado] = useState(null); // id del empleado
  const [pin, setPin] = useState("");
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
  const [guardando, setGuardando] = useState(false);
  const [filtroEmpleado, setFiltroEmpleado] = useState("");
  const [pinesNuevos, setPinesNuevos] = useState({});

  const empleadosQ = usePolling(() => consultar("staff", { where: [["activo", "==", true]] }), [], 60000);
  const fichajesQ = usePolling(
    () => consultar("fichajes", { orden: [["fecha", "desc"]], limite: 100 }),
    [],
    15000
  );

  const empleados = [...(empleadosQ.datos || [])].sort((a, b) =>
    (a.nombre || "").localeCompare(b.nombre || "")
  );
  const empleado = empleados.find((e) => e.id === seleccionado);
  const fichajes = fichajesQ.datos || [];

  const historial = useMemo(
    () => fichajes.filter((f) => !filtroEmpleado || f.empleadoUid === filtroEmpleado),
    [fichajes, filtroEmpleado]
  );

  function pulsar(tecla) {
    setMensaje({ tipo: "", texto: "" });
    if (tecla === "OK") return fichar();
    if (tecla === "⌫") return setPin((p) => p.slice(0, -1));
    if (pin.length < 8) setPin((p) => p + tecla);
  }

  async function fichar() {
    if (!empleado) return setMensaje({ tipo: "error", texto: "Elegí un empleado." });
    if (!empleado.pin) {
      return setMensaje({ tipo: "error", texto: "Ese empleado no tiene PIN. Pedile al admin que lo ponga." });
    }
    if (pin !== String(empleado.pin)) {
      setPin("");
      return setMensaje({ tipo: "error", texto: "PIN incorrecto." });
    }

    setGuardando(true);
    try {
      // Se consulta el último fichaje al momento para no depender de la actualización periódica
      const recientes = await consultar("fichajes", { orden: [["fecha", "desc"]], limite: 200 });
      const ultimo = recientes.find((f) => f.empleadoUid === empleado.id);

      if (tipo === "entrada" && ultimo?.tipo === "entrada") {
        throw new Error(`${empleado.nombre} ya tiene una entrada abierta. Marcá la salida primero.`);
      }
      if (tipo === "salida" && (!ultimo || ultimo.tipo === "salida")) {
        throw new Error(`${empleado.nombre} no tiene una entrada abierta.`);
      }

      await confirmar([
        crear("fichajes", nuevoIdDoc(), {
          empleadoUid: empleado.id,
          empleadoNombre: empleado.nombre || "",
          tipo,
          fecha: ahora(),
        }),
      ]);
      setMensaje({
        tipo: "ok",
        texto: `${tipo === "entrada" ? "Entrada" : "Salida"} marcada para ${empleado.nombre}.`,
      });
      setPin("");
      setSeleccionado(null);
      fichajesQ.recargar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPin(emp) {
    const nuevo = (pinesNuevos[emp.id] || "").trim();
    if (!/^\d{4,8}$/.test(nuevo)) {
      return setMensaje({ tipo: "error", texto: "El PIN debe tener entre 4 y 8 números." });
    }
    try {
      await confirmar([actualizar("staff", emp.id, { pin: nuevo })]);
      setPinesNuevos((p) => ({ ...p, [emp.id]: "" }));
      setMensaje({ tipo: "ok", texto: `PIN guardado para ${emp.nombre}.` });
      empleadosQ.recargar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: "No se pudo guardar el PIN: " + e.message });
    }
  }

  return (
    <section className="stack">
      <div>
        <h2>Personal</h2>
        <p>Fichá entrada y salida con tu PIN.</p>
      </div>

      <div className="card">
        <div className="chips">
          <button className={"chip" + (tipo === "entrada" ? " activo" : "")} onClick={() => setTipo("entrada")}>
            Entrada
          </button>
          <button className={"chip" + (tipo === "salida" ? " activo" : "")} onClick={() => setTipo("salida")}>
            Salida
          </button>
        </div>

        <h3>Seleccioná el empleado</h3>
        {empleadosQ.error && <p className="error">{empleadosQ.error}</p>}
        <div className="empleados-grid">
          {empleados.map((e) => (
            <button
              key={e.id}
              className={"empleado" + (seleccionado === e.id ? " sel" : "")}
              onClick={() => {
                setSeleccionado(e.id);
                setPin("");
                setMensaje({ tipo: "", texto: "" });
              }}
            >
              {e.nombre || "Sin nombre"}
            </button>
          ))}
        </div>

        <div className="pin-caja">
          <span>Empleado: <strong>{empleado?.nombre || "—"}</strong></span>
          <span>PIN: <strong>{"•".repeat(pin.length) || "—"}</strong></span>
        </div>

        <div className="teclado">
          {TECLAS.map((t) => (
            <button
              key={t}
              className={"tecla" + (t === "OK" ? " primary" : "")}
              disabled={guardando}
              onClick={() => pulsar(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {mensaje.texto && (
          <p className={mensaje.tipo === "ok" ? "ok" : "error"}>{mensaje.texto}</p>
        )}
      </div>

      <div className="card">
        <h3>Historial de fichajes</h3>
        <select value={filtroEmpleado} onChange={(e) => setFiltroEmpleado(e.target.value)}>
          <option value="">Todos los empleados</option>
          {empleados.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        {historial.length === 0 && <p style={{ marginTop: 12 }}>Todavía no hay fichajes.</p>}
        {historial.length > 0 && (
          <table className="tabla" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Empleado</th>
                <th>Movimiento</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((f) => (
                <tr key={f.id}>
                  <td>{horaCorta(f.fecha)}</td>
                  <td>{f.empleadoNombre}</td>
                  <td>{f.tipo === "entrada" ? "Entrada" : "Salida"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {esAdmin && (
        <div className="card">
          <h3>PIN de cada empleado</h3>
          {empleados.map((e) => (
            <div key={e.id} className="pin-fila">
              <span>{e.nombre} {e.pin ? "· tiene PIN" : "· sin PIN"}</span>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Nuevo PIN"
                value={pinesNuevos[e.id] || ""}
                onChange={(ev) => setPinesNuevos((p) => ({ ...p, [e.id]: ev.target.value }))}
              />
              <button className="btn" onClick={() => guardarPin(e)}>Guardar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
