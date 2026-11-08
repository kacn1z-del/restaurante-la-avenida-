import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { DENOMINACIONES_CRC, ESTADO_PEDIDO, METODOS_PAGO } from "../lib/constants.js";
import { colones, inicioDelDia } from "../lib/format.js";

export default function Caja({ staff }) {
  const [pedidos, setPedidos] = useState([]);
  const [desde, setDesde] = useState(inicioDelDia());
  const [conteo, setConteo] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  // El turno empieza en el último cierre (o en el inicio del día si no hay)
  useEffect(
    () =>
      onSnapshot(query(collection(db, "cierres"), orderBy("fecha", "desc"), limit(1)), (snap) => {
        const fecha = snap.docs[0]?.data().fecha;
        setDesde(fecha?.toDate ? fecha.toDate() : inicioDelDia());
      }),
    []
  );

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "pedidos"), where("estado", "==", ESTADO_PEDIDO.COBRADO)),
        (snap) => {
          setPedidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      ),
    []
  );

  const resumen = useMemo(() => {
    const porMetodo = Object.fromEntries(METODOS_PAGO.map((m) => [m.id, 0]));
    let totalVentas = 0;
    let cantidad = 0;
    for (const p of pedidos) {
      const fecha = p.cobradoEn?.toDate ? p.cobradoEn.toDate() : null;
      if (!fecha || fecha < desde) continue;
      cantidad += 1;
      totalVentas += Number(p.total) || 0;
      for (const pg of p.pagos || []) {
        porMetodo[pg.metodo] = (porMetodo[pg.metodo] || 0) + (Number(pg.monto) || 0);
      }
    }
    return { porMetodo, totalVentas, cantidad };
  }, [pedidos, desde]);

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
      await addDoc(collection(db, "cierres"), {
        fecha: serverTimestamp(),
        empleadoUid: staff.uid,
        empleadoNombre: staff.nombre || "",
        conteo: Object.fromEntries(DENOMINACIONES_CRC.map((d) => [String(d), Number(conteo[d]) || 0])),
        totalContado,
        esperadoEfectivo,
        diferencia,
        totalVentas: resumen.totalVentas,
        porMetodo: resumen.porMetodo,
        cantidadPedidos: resumen.cantidad,
      });
      setConteo({});
      setMensaje("Caja cerrada.");
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
