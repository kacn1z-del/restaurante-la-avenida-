import { useEffect, useState } from "react";
import { actualizar, ahora, confirmar, consultar, leerDoc } from "../lib/api.js";
import { ESTADO_MESA, ESTADO_PEDIDO } from "../lib/constants.js";
import { colones } from "../lib/format.js";

const ABIERTOS = [ESTADO_PEDIDO.ABIERTO, ESTADO_PEDIDO.EN_COCINA, ESTADO_PEDIDO.LISTO];

function sumar(items) {
  return items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0);
}

// Pasa los productos de esta mesa a la cuenta de otra mesa abierta y libera esta mesa
export default function Juntar({ pedido, onCancelar, onJuntado }) {
  const [opciones, setOpciones] = useState(null); // [{ mesa, pedido }]
  const [destino, setDestino] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const mesas = await consultar("mesas", { where: [["estado", "==", ESTADO_MESA.OCUPADA]] });
        const candidatas = mesas.filter((m) => m.id !== pedido.mesaId && m.pedidoActivoId);
        const pedidos = await Promise.all(candidatas.map((m) => leerDoc("pedidos", m.pedidoActivoId)));
        if (!vivo) return;
        setOpciones(
          candidatas
            .map((m, idx) => ({ mesa: m, pedido: pedidos[idx] }))
            .filter((o) => o.pedido && ABIERTOS.includes(o.pedido.estado))
            .sort((a, b) => a.mesa.numero - b.mesa.numero)
        );
      } catch (e) {
        if (vivo) setError("No se pudieron cargar las mesas: " + e.message);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pedido.mesaId]);

  async function juntar() {
    if (!destino) return;
    setError("");
    setGuardando(true);
    try {
      const itemsNuevos = [...(destino.pedido.items || []), ...(pedido.items || [])];
      await confirmar([
        actualizar("pedidos", destino.pedido.id, {
          items: itemsNuevos,
          total: Math.round(sumar(itemsNuevos)),
        }),
        actualizar("pedidos", pedido.id, {
          estado: ESTADO_PEDIDO.ANULADO,
          unidoA: destino.pedido.id,
          unidoEn: ahora(),
        }),
        actualizar("mesas", pedido.mesaId, {
          estado: ESTADO_MESA.LIBRE,
          pedidoActivoId: null,
        }),
      ]);
      onJuntado();
    } catch (e) {
      setError("No se pudo juntar: " + e.message);
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <h2>Juntar con otra mesa</h2>
        <p>Los productos de la mesa {pedido.mesaNumero} pasan a la cuenta de la mesa que elijas.</p>

        {!opciones && !error && <p className="cargando">Cargando mesas...</p>}
        {opciones && opciones.length === 0 && <p>No hay otras mesas abiertas para juntar.</p>}

        {opciones?.map((o) => (
          <div
            key={o.mesa.id}
            className={"item" + (destino?.mesa.id === o.mesa.id ? " sel" : "")}
            onClick={() => setDestino(o)}
          >
            <div className="item-linea">
              <span>Mesa {o.mesa.numero}</span>
              <span>{colones(o.pedido.total)}</span>
            </div>
            <small>{(o.pedido.items || []).length} productos en la cuenta</small>
          </div>
        ))}

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <button className="btn" onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button className="btn primary" disabled={!destino || guardando} onClick={juntar}>
            {guardando ? "Juntando..." : "Juntar cuentas"}
          </button>
        </div>
      </div>
    </div>
  );
}
