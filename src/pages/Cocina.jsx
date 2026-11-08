import { useState } from "react";
import { actualizar, confirmar, consultar, leerDoc, usePolling } from "../lib/api.js";
import { ESTADO_PEDIDO } from "../lib/constants.js";
import { horaCorta } from "../lib/format.js";

const tiempo = (fecha) => (fecha instanceof Date ? fecha.getTime() : 0);

export default function Cocina({ zonas }) {
  const [error, setError] = useState("");

  const pedidosQ = usePolling(
    () => consultar("pedidos", { where: [["estado", "==", ESTADO_PEDIDO.EN_COCINA]] }),
    [],
    4000
  );

  const pedidos = [...(pedidosQ.datos || [])].sort(
    (a, b) => tiempo(a.creadoEn) - tiempo(b.creadoEn)
  );

  // Equivale a una transacción: si otro dispositivo cambió el pedido mientras tanto,
  // el servidor rechaza la escritura y se vuelve a leer y reintentar.
  async function marcarListo(pedidoId, itemId) {
    setError("");
    for (let intento = 0; intento < 3; intento++) {
      try {
        const actual = await leerDoc("pedidos", pedidoId);
        if (!actual) return;

        const items = (actual.items || []).map((i) =>
          i.id === itemId ? { ...i, listo: true } : i
        );
        const datos = { items };

        // El pedido pasa a "listo" cuando todos los platos enviados están listos
        if (items.filter((i) => i.enviado).every((i) => i.listo)) {
          datos.estado = ESTADO_PEDIDO.LISTO;
        }

        await confirmar([actualizar("pedidos", pedidoId, datos, { version: actual._version })]);
        pedidosQ.recargar();
        return;
      } catch (e) {
        if (e.code !== "FAILED_PRECONDITION") {
          setError("No se pudo marcar: " + e.message);
          return;
        }
      }
    }
    setError("Otro cambio se hizo al mismo tiempo. Tocá de nuevo.");
  }

  const visibles = pedidos
    .map((p) => ({
      ...p,
      pendientes: (p.items || []).filter(
        (i) => i.enviado && !i.listo && zonas.includes(i.zona)
      ),
    }))
    .filter((p) => p.pendientes.length > 0);

  return (
    <section>
      {error && <p className="error">{error}</p>}
      {zonas.length === 0 && <p>Tu rol no tiene zonas asignadas.</p>}
      {zonas.length > 0 && visibles.length === 0 && <p>No hay pedidos pendientes.</p>}

      <div className="cocina-grid">
        {visibles.map((p) => (
          <div key={p.id} className="ticket-cocina">
            <h3>Mesa {p.mesaNumero}</h3>
            <small>{p.empleadoNombre} · {horaCorta(p.creadoEn)}</small>
            {p.pendientes.map((i) => (
              <div key={i.id} className="ticket-linea">
                <div>
                  <strong>{i.cantidad} × {i.nombre}</strong>
                  {i.observaciones?.length > 0 && <small>{i.observaciones.join(", ")}</small>}
                </div>
                <button className="btn primary" onClick={() => marcarListo(p.id, i.id)}>
                  Listo
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
