import { useEffect, useMemo, useState } from "react";
import { ahora, confirmar, consultar, crear, nuevoIdDoc, usePolling } from "../lib/api.js";
import { DENOMINACIONES, ESTADO_PEDIDO, METODOS_PAGO, MONEDAS } from "../lib/constants.js";
import { colones, inicioDelDia } from "../lib/format.js";

const SIMBOLO = { CRC: "₡", USD: "US$", EUR: "€" };
const CLAVE_TERMINAL = "terminal_caja";

function formatear(valor, moneda) {
  if (moneda === "CRC") return colones(valor);
  return `${SIMBOLO[moneda]}${(Number(valor) || 0).toFixed(2)}`;
}

function nombreDenominacion(valor, moneda) {
  if (moneda === "CRC") return `₡${valor.toLocaleString("es-CR")}`;
  return `${SIMBOLO[moneda]}${valor}`;
}

export default function Caja({ staff }) {
  const [desde, setDesde] = useState(inicioDelDia());
  const [conteo, setConteo] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [moneda, setMoneda] = useState("CRC");
  const [terminal, setTerminal] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_TERMINAL) || "1";
    } catch {
      return "1";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_TERMINAL, terminal);
    } catch {
      /* si el navegador no guarda datos, el número queda solo en pantalla */
    }
  }, [terminal]);

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

  const denominaciones = DENOMINACIONES[moneda];
  const totalContado = denominaciones.reduce(
    (s, d) => s + d * (Number(conteo[d]) || 0),
    0
  );
  // La diferencia solo se compara con colones, porque las ventas se registran en colones
  const esperadoEfectivo = resumen.porMetodo.efectivo || 0;
  const diferencia = totalContado - esperadoEfectivo;

  function cambiarMoneda(nueva) {
    setMoneda(nueva);
    setConteo({});
  }

  async function cerrarCaja() {
    if (!confirm("¿Cerrar caja? Se guardará el conteo de este turno.")) return;
    setGuardando(true);
    setMensaje("");
    try {
      await confirmar([
        crear("cierres", nuevoIdDoc(), {
          fecha: ahora(),
          terminal: Number(terminal) || 1,
          moneda,
          empleadoUid: staff.uid,
          empleadoNombre: staff.nombre || "",
          conteo: Object.fromEntries(
            denominaciones.map((d) => [String(d), Number(conteo[d]) || 0])
          ),
          totalContado,
          esperadoEfectivo: moneda === "CRC" ? esperadoEfectivo : null,
          diferencia: moneda === "CRC" ? diferencia : null,
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
        <h2>Conteo de caja</h2>

        <div className="formulario">
          <label>
            <span className="check">Número de terminal</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
            />
          </label>
          <label>
            <span className="check">Moneda del conteo</span>
            <select value={moneda} onChange={(e) => cambiarMoneda(e.target.value)}>
              {MONEDAS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>

        <table className="tabla" style={{ marginTop: 12 }}>
          <tbody>
            {denominaciones.map((d) => (
              <tr key={d}>
                <td>{nombreDenominacion(d, moneda)}</td>
                <td>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={conteo[d] ?? ""}
                    onChange={(e) => setConteo({ ...conteo, [d]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>Total contado: <strong>{formatear(totalContado, moneda)}</strong></p>

        {moneda === "CRC" ? (
          <>
            <p>Efectivo esperado: <strong>{colones(esperadoEfectivo)}</strong></p>
            <p className={diferencia === 0 ? "ok" : "error"}>
              Diferencia: {colones(diferencia)}
            </p>
          </>
        ) : (
          <small>Las ventas se registran en colones, así que aquí no se compara la diferencia.</small>
        )}

        {mensaje && <p>{mensaje}</p>}
        <button className="btn primary bloque" disabled={guardando} onClick={cerrarCaja}>
          {guardando ? "Guardando..." : "Cerrar caja"}
        </button>
      </div>
    </section>
  );
}
