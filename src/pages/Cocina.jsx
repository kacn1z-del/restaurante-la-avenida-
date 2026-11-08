import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { ESTADO_PEDIDO } from "../lib/constants.js";
import { horaCorta } from "../lib/format.js";

export default function Cocina({ zonas }) {
  const [pedidos, setPedidos] = useState([]);
  const [error, setError] = useState("");

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "pedidos"), where("estado", "==", ESTADO_PEDIDO.EN_COCINA)),
        (snap) => {
          const lista = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.creadoEn?.seconds || 0) - (b.creadoEn?.seconds || 0));
          setPedidos(lista);
        }
      ),
    []
  );

  async function marcarListo(pedidoId, itemId) {
    setError("");
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "pedidos", pedidoId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const items = (snap.data().items || []).map((i) =>
          i.id === itemId ? { ...i, listo: true } : i
        );
        const data = { items };

        // El pedido pasa a "listo" cuando todos los platos enviados están listos
        const todoListo = items.filter((i) => i.enviado).every((i) => i.listo);
        if (todoListo) data.estado = ESTADO_PEDIDO.LISTO;

        tx.update(ref, data);
      });
    } catch (e) {
      setError("No se pudo marcar: " + e.message);
    }
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
