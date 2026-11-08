import { useState } from "react";
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { ESTADO_MESA, ESTADO_PEDIDO, METODOS_PAGO } from "../lib/constants.js";
import { colones } from "../lib/format.js";

export default function Cobro({ pedido, productos, onCerrado, onCancelar }) {
  const total = Math.round(Number(pedido.total) || 0);
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: total }]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const suma = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const falta = total - Math.round(suma);
  const cuadra = total > 0 && falta === 0;

  function cambiarPago(idx, cambios) {
    setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, ...cambios } : p)));
  }

  function agregarPago() {
    const usados = pagos.map((p) => p.metodo);
    const metodo = METODOS_PAGO.find((m) => !usados.includes(m.id))?.id || "efectivo";
    setPagos([...pagos, { metodo, monto: Math.max(falta, 0) }]);
  }

  function quitarPago(idx) {
    setPagos(pagos.filter((_, i) => i !== idx));
  }

  async function cobrar() {
    setError("");
    if (!cuadra) {
      setError("La suma de los pagos debe ser igual al total.");
      return;
    }
    setGuardando(true);
    try {
      const batch = writeBatch(db);
      const items = (pedido.items || []).map((i) => ({ ...i, enviado: true, listo: true }));

      batch.update(doc(db, "pedidos", pedido.id), {
        estado: ESTADO_PEDIDO.COBRADO,
        items,
        total,
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: Math.round(Number(p.monto)) })),
        cobradoEn: serverTimestamp(),
      });

      batch.update(doc(db, "mesas", pedido.mesaId), {
        estado: ESTADO_MESA.LIBRE,
        pedidoActivoId: null,
      });

      // Descuento de inventario por cada venta
      for (const item of pedido.items || []) {
        const prod = productos.find((p) => p.id === item.productoId);
        if (!prod) continue;

        if (prod.ingredientes?.length) {
          for (const ing of prod.ingredientes) {
            const cantidad = Number(ing.cantidad) * item.cantidad;
            batch.update(doc(db, "productos", ing.productoId), {
              stockActual: increment(-cantidad),
            });
            batch.set(doc(collection(db, "movimientos")), {
              productoId: ing.productoId,
              cantidad: -cantidad,
              motivo: "venta",
              pedidoId: pedido.id,
              fecha: serverTimestamp(),
            });
          }
        } else if (prod.controlaStock) {
          batch.update(doc(db, "productos", prod.id), {
            stockActual: increment(-item.cantidad),
          });
          batch.set(doc(collection(db, "movimientos")), {
            productoId: prod.id,
            cantidad: -item.cantidad,
            motivo: "venta",
            pedidoId: pedido.id,
            fecha: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      onCerrado();
    } catch (e) {
      setError("No se pudo cobrar: " + e.message);
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <h2>Cobrar mesa {pedido.mesaNumero}</h2>
        <p className="total-grande">Total {colones(total)}</p>

        {pagos.map((p, idx) => (
          <div className="pago-fila" key={idx}>
            <select
              value={p.metodo}
              onChange={(e) => cambiarPago(idx, { metodo: e.target.value })}
            >
              {METODOS_PAGO.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={p.monto}
              onChange={(e) => cambiarPago(idx, { monto: e.target.value })}
            />
            {pagos.length > 1 && (
              <button className="btn peligro" onClick={() => quitarPago(idx)}>×</button>
            )}
          </div>
        ))}

        <button className="btn" onClick={agregarPago} disabled={falta <= 0}>
          + Agregar otro método
        </button>

        <p className={cuadra ? "ok" : "error"}>
          Pagado {colones(suma)} ·{" "}
          {falta > 0 ? `Faltan ${colones(falta)}` : falta < 0 ? `Sobran ${colones(-falta)}` : "Cuadra"}
        </p>

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <button className="btn" onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button className="btn primary" disabled={!cuadra || guardando} onClick={cobrar}>
            {guardando ? "Cobrando..." : "Cobrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
