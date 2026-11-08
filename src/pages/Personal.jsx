import { useMemo, useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { ROL } from "../lib/constants.js";
import { horaCorta } from "../lib/format.js";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];

const PUESTOS = [
  { id: "mesero", label: "Mesero" },
  { id: "cocina", label: "Cocina" },
  { id: "barra", label: "Barra" },
  { id: "caja", label: "Caja" },
  { id: "admin", label: "Administrador" },
];

const nombrePuesto = (id) => PUESTOS.find((p) => p.id === id)?.label || id || "—";
const nombreCompleto = (e) => `${e.nombre || ""} ${e.apellidos || ""}`.trim();

const FORM_VACIO = { nombre: "", apellidos: "", numero: "", puesto: "mesero", pin: "" };

// Fichaje de entrada y salida con PIN, historial y, para el admin, alta de empleados
export default function Personal({ staff }) {
  const esAdmin = staff?.rol === ROL.ADMIN;
  const [tipo, setTipo] = useState("entrada");
  const [seleccionado, setSeleccionado] = useState(null); // id del empleado
  const [pin, setPin] = useState("");
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
  const [guardando, setGuardando] = useState(false);
  const [filtroEmpleado, setFiltroEmpleado] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [pinesNuevos, setPinesNuevos] = useState({});

  const empleadosQ = usePolling(() => consultar("empleados", { orden: [["numeroEmpleado"]] }), [], 60000);
  const fichajesQ = usePolling(
    () => consultar("fichajes", { orden: [["fecha", "desc"]], limite: 100 }),
    [],
    15000
  );

  const todos = empleadosQ.datos || [];
  const activos = todos.filter((e) => e.activo !== false);
  const empleado = activos.find((e) => e.id === seleccionado);
  const fichajes = fichajesQ.datos || [];
  const siguienteNumero = Math.max(0, ...todos.map((e) => Number(e.numeroEmpleado) || 0)) + 1;

  const historial = useMemo(
    () => fichajes.filter((f) => !filtroEmpleado || f.empleadoId === filtroEmpleado),
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
      const ultimo = recientes.find((f) => f.empleadoId === empleado.id);

      if (tipo === "entrada" && ultimo?.tipo === "entrada") {
        throw new Error(`${nombreCompleto(empleado)} ya tiene una entrada abierta. Marcá la salida primero.`);
      }
      if (tipo === "salida" && (!ultimo || ultimo.tipo === "salida")) {
        throw new Error(`${nombreCompleto(empleado)} no tiene una entrada abierta.`);
      }

      await confirmar([
        crear("fichajes", nuevoIdDoc(), {
          empleadoId: empleado.id,
          empleadoNombre: nombreCompleto(empleado),
          numeroEmpleado: Number(empleado.numeroEmpleado) || null,
          tipo,
          fecha: ahora(),
        }),
      ]);
      setMensaje({
        tipo: "ok",
        texto: `${tipo === "entrada" ? "Entrada" : "Salida"} marcada para ${nombreCompleto(empleado)}.`,
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

  async function crearEmpleado(e) {
    e.preventDefault();
    setMensaje({ tipo: "", texto: "" });
    const numero = Number(form.numero || siguienteNumero);
    if (!form.nombre.trim() || !form.apellidos.trim()) {
      return setMensaje({ tipo: "error", texto: "Poné el nombre y los apellidos." });
    }
    if (!Number.isInteger(numero) || numero <= 0) {
      return setMensaje({ tipo: "error", texto: "El número de empleado debe ser un entero mayor que cero." });
    }
    if (todos.some((x) => Number(x.numeroEmpleado) === numero)) {
      return setMensaje({ tipo: "error", texto: `Ya existe un empleado con el número ${numero}.` });
    }
    if (!/^\d{4,8}$/.test(form.pin)) {
      return setMensaje({ tipo: "error", texto: "El PIN debe tener entre 4 y 8 números." });
    }

    setGuardando(true);
    try {
      await confirmar([
        crear("empleados", nuevoIdDoc(), {
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          numeroEmpleado: numero,
          puesto: form.puesto,
          pin: form.pin,
          activo: true,
          creadoEn: ahora(),
        }),
      ]);
      setForm(FORM_VACIO);
      setMensaje({ tipo: "ok", texto: "Empleado agregado." });
      empleadosQ.recargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: "No se pudo agregar: " + err.message });
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
      await confirmar([actualizar("empleados", emp.id, { pin: nuevo })]);
      setPinesNuevos((p) => ({ ...p, [emp.id]: "" }));
      setMensaje({ tipo: "ok", texto: `PIN guardado para ${nombreCompleto(emp)}.` });
      empleadosQ.recargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: "No se pudo guardar el PIN: " + err.message });
    }
  }

  async function cambiarActivo(emp) {
    try {
      await confirmar([actualizar("empleados", emp.id, { activo: emp.activo === false })]);
      empleadosQ.recargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: "No se pudo cambiar: " + err.message });
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
        {empleadosQ.datos && activos.length === 0 && (
          <p>Todavía no hay empleados. El admin los puede agregar abajo.</p>
        )}
        <div className="empleados-grid">
          {activos.map((e) => (
            <button
              key={e.id}
              className={"empleado" + (seleccionado === e.id ? " sel" : "")}
              onClick={() => {
                setSeleccionado(e.id);
                setPin("");
                setMensaje({ tipo: "", texto: "" });
              }}
            >
              <span className="empleado__numero">#{e.numeroEmpleado}</span>
              {nombreCompleto(e)}
            </button>
          ))}
        </div>

        <div className="pin-caja">
          <span>Empleado: <strong>{empleado ? nombreCompleto(empleado) : "—"}</strong></span>
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
          {todos.map((e) => (
            <option key={e.id} value={e.id}>#{e.numeroEmpleado} {nombreCompleto(e)}</option>
          ))}
        </select>
        {historial.length === 0 && <p style={{ marginTop: 12 }}>Todavía no hay fichajes.</p>}
        {historial.length > 0 && (
          <table className="tabla" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Número</th>
                <th>Empleado</th>
                <th>Movimiento</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((f) => (
                <tr key={f.id}>
                  <td>{horaCorta(f.fecha)}</td>
                  <td>{f.numeroEmpleado ?? "—"}</td>
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
          <h3>Agregar empleado</h3>
          <form onSubmit={crearEmpleado} className="formulario">
            <input
              placeholder="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
            <input
              placeholder="Apellidos"
              value={form.apellidos}
              onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
              required
            />
            <input
              type="number"
              inputMode="numeric"
              min="1"
              placeholder={`Número de empleado (${siguienteNumero})`}
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
            />
            <select value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })}>
              {PUESTOS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              type="password"
              inputMode="numeric"
              placeholder="PIN (4 a 8 números)"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              required
            />
            <button className="btn primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Agregar empleado"}
            </button>
          </form>
        </div>
      )}

      {esAdmin && (
        <div className="card">
          <h3>Empleados</h3>
          {todos.length === 0 && <p>Todavía no hay empleados.</p>}
          {todos.map((e) => (
            <div key={e.id} className="pin-fila">
              <span>
                <strong>#{e.numeroEmpleado}</strong> {nombreCompleto(e)}
                <br />
                <small>
                  {nombrePuesto(e.puesto)} · {e.pin ? "tiene PIN" : "sin PIN"}
                  {e.activo === false ? " · inactivo" : ""}
                </small>
              </span>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Nuevo PIN"
                value={pinesNuevos[e.id] || ""}
                onChange={(ev) => setPinesNuevos((p) => ({ ...p, [e.id]: ev.target.value }))}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" onClick={() => guardarPin(e)}>PIN</button>
                <button className="btn" onClick={() => cambiarActivo(e)}>
                  {e.activo === false ? "Activar" : "Desactivar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
