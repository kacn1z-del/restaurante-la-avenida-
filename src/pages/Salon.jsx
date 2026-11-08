import { useEffect, useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { ESTADO_MESA, ESTADO_PEDIDO } from "../lib/constants.js";
import { colones, horaCorta } from "../lib/format.js";
import Reservas from "../components/Reservas.jsx";

const MINUTOS_ANTES = 30;
const MINUTOS_DESPUES = 120;

// Color de la mesa según cuánto lleva ocupada
function claseTiempo(pedido) {
  const creado = pedido?.creadoEn instanceof Date ? pedido.creadoEn.getTime() : Date.now();
  const minutos = (Date.now() - creado) / 60000;
  if (minutos < 20) return "t-ok";
  if (minutos < 40) return "t-alerta";
  return "t-tarde";
}

// Primer nombre del empleado para mostrarlo en la mesa
function primerNombre(nombre) {
  return (nombre || "").trim().split(" ")[0] || "";
}

export default function Salon({ staff, onAbrirPedido }) {
  const [salonId, setSalonId] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [modoDiseno, setModoDiseno] = useState(false);
  const [vistaTiempo, setVistaTiempo] = useState(false);
  const [reservasAbiertas, setReservasAbiertas] = useState(false);

  const salonesQ = usePolling(() => consultar("salones", { orden: [["orden"]] }), [], 15000);
  const mesasQ = usePolling(() => consultar("mesas", { orden: [["numero"]] }), [], 6000);
  const pedidosQ = usePolling(
    () =>
      consultar("pedidos", {
        where: [
          ["estado", "in", [ESTADO_PEDIDO.ABIERTO, ESTADO_PEDIDO.EN_COCINA, ESTADO_PEDIDO.LISTO]],
        ],
      }),
    [],
    6000
  );
  const reservasQ = usePolling(
    () => consultar("reservas", { where: [["estado", "==", "activa"]] }),
    [],
    30000
  );

  const salones = salonesQ.datos || [];
  const mesas = mesasQ.datos || [];
  const pedidos = Object.fromEntries((pedidosQ.datos || []).map((p) => [p.id, p]));

  useEffect(() => {
    if (!salonId && salones.length) setSalonId(salones[0].id);
  }, [salones, salonId]);

  // Reserva más cercana por mesa, dentro de la ventana de hoy
  const ahoraMs = Date.now();
  const reservaPorMesa = {};
  for (const r of reservasQ.datos || []) {
    if (!r.mesaId || !(r.fechaHora instanceof Date)) continue;
    const t = r.fechaHora.getTime();
    const dentro = t >= ahoraMs - MINUTOS_ANTES * 60000 && t <= ahoraMs + MINUTOS_DESPUES * 60000;
    if (!dentro) continue;
    const actual = reservaPorMesa[r.mesaId];
    if (!actual || t < actual.fechaHora.getTime()) reservaPorMesa[r.mesaId] = r;
  }

  async function tocarMesa(mesa) {
    if (modoDiseno) return;
    setError("");
    const pedido = pedidos[mesa.pedidoActivoId];

    if (mesa.estado === ESTADO_MESA.OCUPADA && pedido) {
      onAbrirPedido({ pedidoId: pedido.id, mesaNumero: mesa.numero });
      return;
    }
    if (mesa.estado === ESTADO_MESA.OCUPADA && !pedido) {
      setError(`La mesa ${mesa.numero} está marcada como ocupada sin pedido. Revisala en Menú.`);
      return;
    }
    if (mesa.estado !== ESTADO_MESA.LIBRE) return;

    setOcupado(true);
    try {
      const pedidoId = nuevoIdDoc();
      await confirmar([
        crear("pedidos", pedidoId, {
          mesaId: mesa.id,
          mesaNumero: mesa.numero,
          salonId: mesa.salonId,
          empleadoUid: staff.uid,
          empleadoNombre: staff.nombre || "",
          estado: ESTADO_PEDIDO.ABIERTO,
          items: [],
          total: 0,
          pagos: [],
          creadoEn: ahora(),
          cobradoEn: null,
        }),
        actualizar("mesas", mesa.id, {
          estado: ESTADO_MESA.OCUPADA,
          pedidoActivoId: pedidoId,
        }),
      ]);
      mesasQ.recargar();
      pedidosQ.recargar();
      onAbrirPedido({ pedidoId, mesaNumero: mesa.numero });
    } catch (e) {
      setError("No se pudo abrir la mesa: " + e.message);
    } finally {
      setOcupado(false);
    }
  }

  // Modo diseño: mueve la mesa una posición a la izquierda o a la derecha dentro del salón
  async function moverMesa(mesa, direccion) {
    const lista = [...mesasDelSalon];
    const idx = lista.findIndex((m) => m.id === mesa.id);
    const nuevo = idx + direccion;
    if (nuevo < 0 || nuevo >= lista.length) return;
    const [quitada] = lista.splice(idx, 1);
    lista.splice(nuevo, 0, quitada);

    // Se guarda la posición de todas las mesas del salón para que el orden quede parejo
    const escrituras = lista
      .map((m, i) => (m.posicion === i ? null : actualizar("mesas", m.id, { posicion: i })))
      .filter(Boolean);
    try {
      await confirmar(escrituras);
      mesasQ.recargar();
    } catch (e) {
      setError("No se pudo mover la mesa: " + e.message);
    }
  }

  const mesasDelSalon = mesas
    .filter((m) => m.salonId === salonId)
    .sort((a, b) => (a.posicion ?? 1e9) - (b.posicion ?? 1e9) || a.numero - b.numero);

  return (
    <section className="salon">
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

      <div className="plano-panel">
        {modoDiseno && <p className="plano-titulo">Modo diseño</p>}

        {error && <p className="error">{error}</p>}

        <div className="plano-grid">
          {mesasDelSalon.map((m, idx) => {
            const pedido = pedidos[m.pedidoActivoId];
            const reserva = reservaPorMesa[m.id];

            let clase = m.estado;
            if (m.estado === ESTADO_MESA.LIBRE && reserva) clase = ESTADO_MESA.RESERVADA;
            if (m.estado === ESTADO_MESA.OCUPADA && vistaTiempo && pedido) clase = claseTiempo(pedido);

            return (
              <div key={m.id} className="mesa-tile">
                <button className="mesa-tile__cuerpo" disabled={ocupado} onClick={() => tocarMesa(m)}>
                  <span className="mesa-tile__num">{m.numero}</span>
                  {pedido && (
                    <span className="mesa-tile__info">
                      {primerNombre(pedido.empleadoNombre)} · {colones(pedido.total)}
                    </span>
                  )}
                  {!pedido && reserva && (
                    <span className="mesa-tile__info">Reserva {horaCorta(reserva.fechaHora)}</span>
                  )}
                  {pedido?.estado === ESTADO_PEDIDO.LISTO && <span className="badge">Listo</span>}
                </button>

                <div className={`mesa-tile__barra barra-${clase}`} />

                {modoDiseno && (
                  <div className="mesa-flechas">
                    <button className="btn" disabled={idx === 0} onClick={() => moverMesa(m, -1)}>◀</button>
                    <button
                      className="btn"
                      disabled={idx === mesasDelSalon.length - 1}
                      onClick={() => moverMesa(m, 1)}
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {mesasDelSalon.length === 0 && (
          <p>No hay mesas en este salón. Crealas en la pestaña Menú.</p>
        )}

        <div className="plano-leyenda">
          <span className="ley ley-libre">Libre</span>
          <span className="ley ley-ocupada">Ocupada</span>
          <span className="ley ley-reservada">Reservada</span>
          <span className="ley ley-otro_terminal">Otro terminal</span>
          <div className="chips">
            <button className={"chip" + (!vistaTiempo ? " activo" : "")} onClick={() => setVistaTiempo(false)}>
              Color
            </button>
            <button className={"chip" + (vistaTiempo ? " activo" : "")} onClick={() => setVistaTiempo(true)}>
              Movimiento
            </button>
          </div>
        </div>
      </div>

      <div className="salon-acciones">
        <button className="btn" onClick={() => setReservasAbiertas(true)}>Reservas de mesas</button>
        <button
          className={"btn" + (modoDiseno ? " primary" : "")}
          onClick={() => setModoDiseno((v) => !v)}
        >
          Modo diseño {modoDiseno ? "(activo)" : ""}
        </button>
      </div>

      {reservasAbiertas && (
        <Reservas mesas={mesas} onCerrar={() => setReservasAbiertas(false)} />
      )}
    </section>
  );
}
