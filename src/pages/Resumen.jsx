import { useMemo } from "react";
import { consultar, usePolling } from "../lib/api.js";
import { ESTADO_MESA, ESTADO_PEDIDO, METODOS_PAGO } from "../lib/constants.js";
import { colones, inicioDelDia } from "../lib/format.js";

const ABIERTOS = [ESTADO_PEDIDO.ABIERTO, ESTADO_PEDIDO.EN_COCINA, ESTADO_PEDIDO.LISTO];

export default function Resumen() {
  // Pedidos cobrados desde medianoche
  const cobradosQ = usePolling(
    () => consultar("pedidos", { where: [["cobradoEn", ">=", inicioDelDia()]] }),
    [],
    20000
  );

  // Pedidos que siguen en curso (sin importar la fecha)
  const abiertosQ = usePolling(
    () => consultar("pedidos", { where: [["estado", "in", ABIERTOS]] }),
    [],
    10000
  );

  const mesasQ = usePolling(
    () => consultar("mesas", { where: [["estado", "==", ESTADO_MESA.OCUPADA]] }),
    [],
    10000
  );

  const stats = useMemo(() => {
    const cobrados = (cobradosQ.datos || []).filter((p) => p.estado === ESTADO_PEDIDO.COBRADO);
    const porMetodo = Object.fromEntries(METODOS_PAGO.map((m) => [m.id, 0]));
    const productos = {};
    let totalVentas = 0;

    for (const p of cobrados) {
      totalVentas += Number(p.total) || 0;
      for (const pg of p.pagos || []) {
        porMetodo[pg.metodo] = (porMetodo[pg.metodo] || 0) + (Number(pg.monto) || 0);
      }
      for (const i of p.items || []) {
        const clave = i.nombre || "Sin nombre";
        productos[clave] = (productos[clave] || 0) + (Number(i.cantidad) || 0);
      }
    }

    const topProductos = Object.entries(productos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      cantidad: cobrados.length,
      totalVentas,
      ticketPromedio: cobrados.length ? totalVentas / cobrados.length : 0,
      porMetodo,
      topProductos,
    };
  }, [cobradosQ.datos]);

  const porEstado = useMemo(() => {
    const conteo = { [ESTADO_PEDIDO.ABIERTO]: 0, [ESTADO_PEDIDO.EN_COCINA]: 0, [ESTADO_PEDIDO.LISTO]: 0 };
    for (const p of abiertosQ.datos || []) {
      if (conteo[p.estado] !== undefined) conteo[p.estado] += 1;
    }
    return conteo;
  }, [abiertosQ.datos]);

  const cargando = cobradosQ.datos === null && !cobradosQ.error;

  return (
    <section className="stack">
      <div>
        <h2>Resumen del día</h2>
        <p>Lo cobrado desde hoy a las 00:00 y el estado del local en este momento.</p>
      </div>

      {cargando && <p className="cargando">Cargando resumen...</p>}
      {cobradosQ.error && <p className="error">{cobradosQ.error}</p>}

      <div className="metricas">
        <div className="metrica">
          <span className="metrica__label">Ventas de hoy</span>
          <span className="metrica__valor">{colones(stats.totalVentas)}</span>
        </div>
        <div className="metrica">
          <span className="metrica__label">Pedidos cobrados</span>
          <span className="metrica__valor">{stats.cantidad}</span>
        </div>
        <div className="metrica">
          <span className="metrica__label">Ticket promedio</span>
          <span className="metrica__valor">{colones(stats.ticketPromedio)}</span>
        </div>
        <div className="metrica">
          <span className="metrica__label">Mesas ocupadas</span>
          <span className="metrica__valor">{mesasQ.datos?.length ?? "—"}</span>
        </div>
      </div>

      <div className="card">
        <h3>En curso ahora</h3>
        <table className="tabla">
          <tbody>
            <tr>
              <td>Abiertos</td>
              <td>{porEstado[ESTADO_PEDIDO.ABIERTO]}</td>
            </tr>
            <tr>
              <td>En cocina / barra</td>
              <td>{porEstado[ESTADO_PEDIDO.EN_COCINA]}</td>
            </tr>
            <tr>
              <td>Listos para servir</td>
              <td>{porEstado[ESTADO_PEDIDO.LISTO]}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Ventas por método de pago</h3>
        <table className="tabla">
          <tbody>
            {METODOS_PAGO.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td>{colones(stats.porMetodo[m.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Más vendidos hoy</h3>
        {stats.topProductos.length === 0 ? (
          <p>Todavía no hay ventas cobradas hoy.</p>
        ) : (
          <table className="tabla">
            <tbody>
              {stats.topProductos.map(([nombre, cantidad]) => (
                <tr key={nombre}>
                  <td>{nombre}</td>
                  <td>{cantidad} uds.</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
