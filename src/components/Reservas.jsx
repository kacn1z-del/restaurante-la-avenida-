import { useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { enlaceWhatsapp, horaCorta } from "../lib/format.js";
import { useNegocio } from "../lib/negocio.js";

const FORM_VACIO = { nombre: "", telefono: "", personas: "2", fechaHora: "", mesaId: "", notas: "" };

// Muestra reservas activas (desde 3 horas atrás) y permite crear, confirmar por WhatsApp o cancelar
export default function Reservas({ mesas, onCerrar }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const negocio = useNegocio();

  const reservasQ = usePolling(
    () => consultar("reservas", { where: [["estado", "==", "activa"]] }),
    [],
    20000
  );

  const limite = Date.now() - 3 * 60 * 60 * 1000;
  const reservas = (reservasQ.datos || [])
    .filter((r) => r.fechaHora instanceof Date && r.fechaHora.getTime() >= limite)
    .sort((a, b) => a.fechaHora - b.fechaHora);

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function mensajeConfirmacion(r) {
    const fecha = r.fechaHora.toLocaleDateString("es-CR");
    const hora = horaCorta(r.fechaHora);
    return (
      `Hola ${r.nombre}, confirmamos su reserva en ${negocio.nombre} ` +
      `para ${r.personas} persona(s) el ${fecha} a las ${hora}.` +
      (r.mesaNumero ? ` Su mesa es la ${r.mesaNumero}.` : "") +
      ` ¡Lo esperamos!`
    );
  }

  async function guardar() {
    setError("");
    if (!form.nombre.trim()) return setError("Poné el nombre de la reserva.");
    if (!form.fechaHora) return setError("Elegí la fecha y la hora.");
    const fecha = new Date(form.fechaHora);
    if (Number.isNaN(fecha.getTime())) return setError("La fecha no es válida.");

    const mesa = mesas.find((m) => m.id === form.mesaId);
    setGuardando(true);
    try {
      await confirmar([
        crear("reservas", nuevoIdDoc(), {
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim(),
          personas: Number(form.personas) || 1,
          fechaHora: fecha,
          mesaId: mesa?.id ?? null,
          mesaNumero: mesa?.numero ?? null,
          notas: form.notas.trim(),
          estado: "activa",
          creadoEn: ahora(),
        }),
      ]);
      setForm(FORM_VACIO);
      reservasQ.recargar();
    } catch (e) {
      setError("No se pudo guardar la reserva: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cancelar(reserva) {
    if (!confirm(`¿Cancelar la reserva de ${reserva.nombre}?`)) return;
    try {
      await confirmar([
        actualizar("reservas", reserva.id, { estado: "cancelada", canceladaEn: ahora() }),
      ]);
      reservasQ.recargar();
    } catch (e) {
      setError("No se pudo cancelar: " + e.message);
    }
  }

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <h2>Reservas de mesas</h2>

        {reservasQ.error && <p className="error">{reservasQ.error}</p>}
        {reservasQ.datos && reservas.length === 0 && <p>No hay reservas próximas.</p>}

        {reservas.map((r) => (
          <div key={r.id} className="item">
            <div className="item-linea">
              <span>{horaCorta(r.fechaHora)} · {r.nombre}</span>
              <span>{r.personas} pers.</span>
            </div>
            <small>
              {r.mesaNumero ? `Mesa ${r.mesaNumero}` : "Sin mesa asignada"}
              {r.telefono ? ` · ${r.telefono}` : ""}
              {r.notas ? ` · ${r.notas}` : ""}
            </small>
            <div className="item-acciones">
              <a
                className="btn"
                href={enlaceWhatsapp(r.telefono, mensajeConfirmacion(r))}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
              <button className="btn peligro" onClick={() => cancelar(r)}>Cancelar reserva</button>
            </div>
          </div>
        ))}

        <h3>Nueva reserva</h3>
        <div className="formulario">
          <input
            placeholder="Nombre"
            value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
          <input
            placeholder="Teléfono"
            inputMode="tel"
            value={form.telefono}
            onChange={(e) => cambiar("telefono", e.target.value)}
          />
          <input
            type="number"
            inputMode="numeric"
            min="1"
            placeholder="Personas"
            value={form.personas}
            onChange={(e) => cambiar("personas", e.target.value)}
          />
          <input
            type="datetime-local"
            value={form.fechaHora}
            onChange={(e) => cambiar("fechaHora", e.target.value)}
          />
          <select value={form.mesaId} onChange={(e) => cambiar("mesaId", e.target.value)}>
            <option value="">Sin mesa</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id}>Mesa {m.numero}</option>
            ))}
          </select>
          <input
            placeholder="Notas"
            value={form.notas}
            onChange={(e) => cambiar("notas", e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <button className="btn" onClick={onCerrar}>Cerrar</button>
          <button className="btn primary" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando..." : "Guardar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}
