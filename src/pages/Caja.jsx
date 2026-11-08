import { useEffect, useMemo, useState } from "react";
import { ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { DENOMINACIONES_CRC, ESTADO_PEDIDO, METODOS_PAGO } from "../lib/constants.js";
import { colones, inicioDelDia } from "../lib/format.js";

export default function Caja({ staff }) {
  const [desde, setDesde] = useState(inicioDelDia());
  const [conteo, setConteo] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  // El turno empieza en el último cierre (o en el inicio del día si no hay)
  const cierreQ = usePolling(
    () => consultar("cierres", { orden: [["fecha", "desc"]], limite: 1 }),
    [],
    20000
  );
  const fechaUltimoCierre = cierreQ.datos?.[0]?.fecha;
  const claveCierre = fechaUltimoCierre instanceof Date ? fechaUltimoCierre.getTime() : 0;

  useEffect(() => {
    setDesde(claveCierre ? new Date(claveCierre) : inicioDelDia());
  }, [claveCierre]);

  // Solo pedidos cobrados desde el inicio del turno
  const pedidosQ = usePolling(
    () => consultar("pedidos", { where: [["cobradoEn", ">=", desde]] }),
    [desde.getTime()],
    20000
  );

  const resumen = useMemo(() => {
    const porMetodo = Object.fromEntries(METODOS_PAGO.map((m) => [m.id, 0]));
    let totalVentas = 0;
    let cantidad = 0;
    for (const p of pedidosQ.datos || []) {
      const fecha = p.cobradoEn instanceof Date ? p.cobradoEn : null;
      if (p.estado !== ESTADO_PEDIDO.COBRADO || !fecha || fecha < desde) continue;
      cantidad += 1;
      totalVentas += Number(p.total) || 0;
      for (const pg of p.pagos || []) {
        porMetodo[pg.metodo] = (porMetodo[pg.metodo] || 0) + (Number(pg.monto) || 0);
      }
    }
    return { porMetodo, totalVentas, cantidad };
  }, [pedidosQ.datos, desde]);

  const totalContado = DENOMINACIONES_CRC.reduce(
    (s, d) => s + d * (Number(conteo[d]) || 0),
    0
  );
  const esperadoEfectivo = resumen.porMetodo.efectivo || 0;
  const diferencia = totalContado - esperadoEfectivo;

  async function cerrarCaja() {
    if (!confirm("¿Cerrar caja? Se guardará el conteo de este turno.")) return;
    setGuardando(true);
    setMensaje("");
    try {
      await confirmar([
        crear("cierres", nuevoIdDoc(), {
          fecha: ahora(),
          empleadoUid: staff.uid,
          empleadoNombre: staff.nombre || "",
          conteo: Object.fromEntries(
            DENOMINACIONES_CRC.map((d) => [String(d), Number(conteo[d]) || 0])
          ),
          totalContado,
          esperadoEfectivo,
          diferencia,
          totalVentas: resumen.totalVentas,
          porMetodo: resumen.porMetodo,
          cantidadPedidos: resumen.cantidad,
        }),
      ]);
      setConteo({});
      setMensaje("Caja cerrada.");
      cierreQ.recargar();
    } catch (e) {
      setMensaje("Error: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="stack">
      <div className="card">
        <h2>Ventas del turno</h2>
        <p>Pedidos cobrados: <strong>{resumen.cantidad}</strong></p>
        <p>Total vendido: <strong>{colones(resumen.totalVentas)}</strong></p>
        <table className="tabla">
          <tbody>
            {METODOS_PAGO.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td>{colones(resumen.porMetodo[m.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Conteo de caja (colones)</h2>
        <table className="tabla">
          <tbody>
            {DENOMINACIONES_CRC.map((d) => (
              <tr key={d}>
                <td>₡{d.toLocaleString("es-CR")}</td>
                <td>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={conteo[d] ?? ""}
                    onChange={(e) => setConteo({ ...conteo, [d]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>Total contado: <strong>{colones(totalContado)}</strong></p>
        <p>Efectivo esperado: <strong>{colones(esperadoEfectivo)}</strong></p>
        <p className={diferencia === 0 ? "ok" : "error"}>
          Diferencia: {colones(diferencia)}
        </p>

        {mensaje && <p>{mensaje}</p>}
        <button className="btn primary bloque" disabled={guardando} onClick={cerrarCaja}>
          {guardando ? "Guardando..." : "Cerrar caja"}
        </button>
      </div>
    </section>
  );
}
