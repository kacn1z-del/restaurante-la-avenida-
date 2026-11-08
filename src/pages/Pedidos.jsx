import { useMemo, useState } from "react";
import { consultar, usePolling } from "../lib/api.js";
import { ESTADO_PEDIDO } from "../lib/constants.js";
import { colones, horaCorta, inicioDelDia } from "../lib/format.js";

const ABIERTOS = [ESTADO_PEDIDO.ABIERTO, ESTADO_PEDIDO.EN_COCINA, ESTADO_PEDIDO.LISTO];

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: ESTADO_PEDIDO.ABIERTO, label: "Abiertos" },
  { id: ESTADO_PEDIDO.EN_COCINA, label: "En cocina" },
  { id: ESTADO_PEDIDO.LISTO, label: "Listos" },
  { id: ESTADO_PEDIDO.COBRADO, label: "Cobrados" },
];

const NOMBRE_ESTADO = {
  [ESTADO_PEDIDO.ABIERTO]: "Abierto",
  [ESTADO_PEDIDO.EN_COCINA]: "En cocina",
  [ESTADO_PEDIDO.LISTO]: "Listo",
  [ESTADO_PEDIDO.COBRADO]: "Cobrado",
  [ESTADO_PEDIDO.ANULADO]: "Anulado",
};

function totalDePedido(p) {
  if (p.total !== undefined && p.total !== null) return Number(p.total) || 0;
  return (p.items || []).reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0);
}

export default function Pedidos({ onAbrirPedido }) {
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const abiertosQ = usePolling(
    () => consultar("pedidos", { where: [["estado", "in", ABIERTOS]] }),
    [],
    6000
  );

  const cobradosQ = usePolling(
    () => consultar("pedidos", { where: [["cobradoEn", ">=", inicioDelDia()]] }),
    [],
    20000
  );

  const pedidos = useMemo(() => {
    const mapa = new Map();
    for (const p of [...(abiertosQ.datos || []), ...(cobradosQ.datos || [])]) {
      mapa.set(p.id, p);
    }
    return [...mapa.values()].sort((a, b) => {
      const fa = a.creadoEn instanceof Date ? a.creadoEn.getTime() : 0;
      const fb = b.creadoEn instanceof Date ? b.creadoEn.getTime() : 0;
      return fb - fa;
    });
  }, [abiertosQ.datos, cobradosQ.datos]);

  const visibles = pedidos.filter((p) => {
    if (filtro !== "todos" && p.estado !== filtro) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const coincide =
        String(p.mesaNumero ?? "").includes(q) ||
        (p.empleadoNombre || "").toLowerCase().includes(q);
      if (!coincide) return false;
    }
    return true;
  });

  const cargando = abiertosQ.datos === null && cobradosQ.datos === null;
  const error = abiertosQ.error || cobradosQ.error;

  return (
    <section className="stack">
      <div>
        <h2>Pedidos</h2>
        <p>Los pedidos abiertos de cualquier fecha y los cobrados desde hoy.</p>
      </div>

      <div className="card">
        <div className="chips" style={{ marginBottom: 12 }}>
          {FILTROS.map((f) => (
            <button
              key={f.id}
              className={"chip" + (filtro === f.id ? " activo" : "")}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          placeholder="Buscar por mesa o empleado"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {cargando && <p className="cargando">Cargando pedidos...</p>}
        {error && <p className="error">{error}</p>}

        {!cargando && visibles.length === 0 && <p>No hay pedidos con este filtro.</p>}

        {visibles.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Mesa</th>
                  <th>Empleado</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const enCurso = ABIERTOS.includes(p.estado);
                  return (
                    <tr
                      key={p.id}
                      onClick={() =>
                        enCurso && onAbrirPedido?.({ pedidoId: p.id, mesaNumero: p.mesaNumero })
                      }
                      style={{ cursor: enCurso ? "pointer" : "default" }}
                    >
                      <td>{horaCorta(p.creadoEn)}</td>
                      <td>Mesa {p.mesaNumero ?? "—"}</td>
                      <td>{p.empleadoNombre || "—"}</td>
                      <td>
                        <span className={"badge-estado estado-" + p.estado}>
                          {NOMBRE_ESTADO[p.estado] || p.estado}
                        </span>
                      </td>
                      <td>{colones(totalDePedido(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 12, fontSize: 13 }}>
          Tocá un pedido abierto para abrirlo en la comanda.
        </p>
      </div>
    </section>
  );
}
