import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { ESTADO_MESA, ESTADO_PEDIDO } from "../lib/constants.js";
import { colones } from "../lib/format.js";

export default function Salon({ staff, onAbrirPedido }) {
  const [salones, setSalones] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState({});
  const [salonId, setSalonId] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () =>
      onSnapshot(query(collection(db, "salones"), orderBy("orden")), (snap) => {
        setSalones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    []
  );

  useEffect(() => {
    if (!salonId && salones.length) setSalonId(salones[0].id);
  }, [salones, salonId]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, "mesas"), orderBy("numero")), (snap) => {
        setMesas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    []
  );

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "pedidos"),
          where("estado", "in", [ESTADO_PEDIDO.ABIERTO, ESTADO_PEDIDO.EN_COCINA, ESTADO_PEDIDO.LISTO])
        ),
        (snap) => {
          const mapa = {};
          snap.docs.forEach((d) => {
            mapa[d.id] = { id: d.id, ...d.data() };
          });
          setPedidos(mapa);
        }
      ),
    []
  );

  async function tocarMesa(mesa) {
    setError("");
    const pedido = pedidos[mesa.pedidoActivoId];

    if (mesa.estado === ESTADO_MESA.OCUPADA && pedido) {
      onAbrirPedido({ pedidoId: pedido.id, mesaNumero: mesa.numero });
      return;
    }
    if (mesa.estado === ESTADO_MESA.OCUPADA && !pedido) {
      setError(`La mesa ${mesa.numero} está marcada como ocupada sin pedido. Revisala en Productos.`);
      return;
    }
    if (mesa.estado !== ESTADO_MESA.LIBRE) return;

    setOcupado(true);
    try {
      const pedidoRef = doc(collection(db, "pedidos"));
      const batch = writeBatch(db);
      batch.set(pedidoRef, {
        mesaId: mesa.id,
        mesaNumero: mesa.numero,
        salonId: mesa.salonId,
        empleadoUid: staff.uid,
        empleadoNombre: staff.nombre || "",
        estado: ESTADO_PEDIDO.ABIERTO,
        items: [],
        total: 0,
        pagos: [],
        creadoEn: serverTimestamp(),
        cobradoEn: null,
      });
      batch.update(doc(db, "mesas", mesa.id), {
        estado: ESTADO_MESA.OCUPADA,
        pedidoActivoId: pedidoRef.id,
      });
      await batch.commit();
      onAbrirPedido({ pedidoId: pedidoRef.id, mesaNumero: mesa.numero });
    } catch (e) {
      setError("No se pudo abrir la mesa: " + e.message);
    } finally {
      setOcupado(false);
    }
  }

  const mesasDelSalon = mesas.filter((m) => m.salonId === salonId);

  return (
    <section>
      <div className="salones-tabs">
        {salones.map((s) => (
          <button
            key={s.id}
            className={"btn" + (s.id === salonId ? " primary" : "")}
            onClick={() => setSalonId(s.id)}
          >
            {s.nombre}
          </button>
        ))}
      </div>

      <div className="leyenda">
        <span className="mesa-libre">Libre</span>
        <span className="mesa-ocupada">Ocupada</span>
        <span className="mesa-reservada">Reservada</span>
        <span className="mesa-otro_terminal">Otro terminal</span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="plano">
        {mesasDelSalon.map((m) => {
          const pedido = pedidos[m.pedidoActivoId];
          return (
            <button
              key={m.id}
              className={`mesa mesa-${m.estado}`}
              disabled={ocupado}
              onClick={() => tocarMesa(m)}
            >
              <span className="mesa-num">{m.numero}</span>
              {pedido && <span className="mesa-info">{colones(pedido.total)}</span>}
              {pedido?.estado === ESTADO_PEDIDO.LISTO && <span className="badge">Listo</span>}
            </button>
          );
        })}
        {mesasDelSalon.length === 0 && (
          <p>No hay mesas en este salón. Crealas en la pestaña Productos.</p>
        )}
      </div>
    </section>
  );
}
