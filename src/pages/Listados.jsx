import { useState } from "react";
import { consultar } from "../lib/api.js";
import { METODOS_PAGO, TIPO_PRODUCTO } from "../lib/constants.js";
import { colones, horaCorta } from "../lib/format.js";

const hoyIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const enRango = (fecha, d0, d1) => fecha instanceof Date && fecha >= d0 && fecha <= d1;
const total = (p) => Number(p.total) || 0;
const dia = (f) => f.toLocaleDateString("es-CR");
const nombreMetodo = (id) => METODOS_PAGO.find((m) => m.id === id)?.label || id;

// Cada reporte recibe los datos del rango y devuelve título, columnas y filas
const REPORTES = [
  {
    id: "ventas-dia",
    grupo: "Ventas",
    label: "Ventas por día",
    armar: ({ cobrados }) => {
      const mapa = {};
      for (const p of cobrados) {
        const k = dia(p.cobradoEn);
        mapa[k] = mapa[k] || { pedidos: 0, total: 0 };
        mapa[k].pedidos += 1;
        mapa[k].total += total(p);
      }
      return {
        columnas: ["Día", "Pedidos", "Total"],
        filas: Object.entries(mapa).map(([k, v]) => [k, v.pedidos, colones(v.total)]),
      };
    },
  },
  {
    id: "ventas-empleado",
    grupo: "Ventas",
    label: "Ventas por empleado",
    armar: ({ cobrados }) => {
      const mapa = {};
      for (const p of cobrados) {
        const k = p.empleadoNombre || "Sin nombre";
        mapa[k] = mapa[k] || { pedidos: 0, total: 0 };
        mapa[k].pedidos += 1;
        mapa[k].total += total(p);
      }
      return {
        columnas: ["Empleado", "Pedidos", "Total"],
        filas: Object.entries(mapa).map(([k, v]) => [k, v.pedidos, colones(v.total)]),
      };
    },
  },
  {
    id: "ventas-pago",
    grupo: "Ventas",
    label: "Ventas por forma de pago",
    armar: ({ cobrados }) => {
      const mapa = Object.fromEntries(METODOS_PAGO.map((m) => [m.id, 0]));
      for (const p of cobrados) {
        for (const pg of p.pagos || []) {
          mapa[pg.metodo] = (mapa[pg.metodo] || 0) + (Number(pg.monto) || 0);
        }
      }
      return {
        columnas: ["Forma de pago", "Total"],
        filas: Object.entries(mapa).map(([k, v]) => [nombreMetodo(k), colones(v)]),
      };
    },
  },
  {
    id: "ventas-hora",
    grupo: "Ventas",
    label: "Ventas por hora",
    armar: ({ cobrados }) => {
      const mapa = {};
      for (const p of cobrados) {
        const k = horaCorta(p.cobradoEn).slice(0, 2) + ":00";
        mapa[k] = mapa[k] || { pedidos: 0, total: 0 };
        mapa[k].pedidos += 1;
        mapa[k].total += total(p);
      }
      return {
        columnas: ["Hora", "Pedidos", "Total"],
        filas: Object.entries(mapa)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => [k, v.pedidos, colones(v.total)]),
      };
    },
  },
  {
    id: "productos-vendidos",
    grupo: "Productos",
    label: "Productos más vendidos",
    armar: ({ cobrados }) => {
      const mapa = {};
      for (const p of cobrados) {
        for (const i of p.items || []) {
          const k = i.nombre || "Sin nombre";
          mapa[k] = mapa[k] || { cantidad: 0, total: 0 };
          mapa[k].cantidad += Number(i.cantidad) || 0;
          mapa[k].total += (Number(i.precio) || 0) * (Number(i.cantidad) || 0);
        }
      }
      return {
        columnas: ["Producto", "Cantidad", "Total"],
        filas: Object.entries(mapa)
          .sort((a, b) => b[1].cantidad - a[1].cantidad)
          .map(([k, v]) => [k, v.cantidad, colones(v.total)]),
      };
    },
  },
  {
    id: "productos-sin-ventas",
    grupo: "Productos",
    label: "Productos sin ventas",
    armar: ({ cobrados, productos }) => {
      const vendidos = new Set();
      for (const p of cobrados) for (const i of p.items || []) vendidos.add(i.productoId);
      return {
        columnas: ["Producto", "Zona"],
        filas: productos
          .filter((p) => p.activo !== false && p.tipo !== TIPO_PRODUCTO.INGREDIENTE && !vendidos.has(p.id))
          .map((p) => [p.nombre, p.zona || "—"]),
      };
    },
  },
  {
    id: "bajo-minimo",
    grupo: "Productos",
    label: "Productos bajo mínimo",
    armar: ({ productos }) => ({
      columnas: ["Producto", "Stock actual", "Stock mínimo"],
      filas: productos
        .filter(
          (p) =>
            p.activo !== false &&
            (p.controlaStock || p.tipo === TIPO_PRODUCTO.INGREDIENTE) &&
            Number(p.stockActual) <= Number(p.stockMinimo)
        )
        .map((p) => [p.nombre, p.stockActual, p.stockMinimo]),
    }),
  },
  {
    id: "eliminadas",
    grupo: "Control",
    label: "Ventas eliminadas",
    armar: ({ anulados }) => ({
      columnas: ["Fecha", "Mesa", "Empleado", "Motivo", "Borrada por", "Total"],
      filas: anulados.map((p) => [
        dia(p.anuladoEn),
        p.mesaNumero ?? "—",
        p.empleadoNombre || "—",
        p.motivoAnulacion || "—",
        p.anuladoPorNombre || "—",
        colones(total(p)),
      ]),
    }),
  },
  {
    id: "cierres",
    grupo: "Control",
    label: "Cierres de caja",
    armar: ({ cierres }) => ({
      columnas: ["Fecha", "Terminal", "Empleado", "Ventas", "Contado", "Diferencia"],
      filas: cierres.map((c) => [
        c.fecha instanceof Date ? `${dia(c.fecha)} ${horaCorta(c.fecha)}` : "—",
        c.terminal ?? "1",
        c.empleadoNombre || "—",
        colones(c.totalVentas),
        c.moneda && c.moneda !== "CRC" ? `${c.moneda} ${c.totalContado}` : colones(c.totalContado),
        c.diferencia == null ? "—" : colones(c.diferencia),
      ]),
    }),
  },
  {
    id: "control-horario",
    grupo: "Control",
    label: "Control horario (fichajes)",
    armar: ({ fichajes }) => ({
      columnas: ["Fecha", "Hora", "Empleado", "Movimiento"],
      filas: fichajes.map((f) => [
        dia(f.fecha),
        horaCorta(f.fecha),
        f.empleadoNombre || "—",
        f.tipo === "entrada" ? "Entrada" : "Salida",
      ]),
    }),
  },
  {
    id: "reservas",
    grupo: "Control",
    label: "Reservas",
    armar: ({ reservas }) => ({
      columnas: ["Fecha", "Hora", "Nombre", "Personas", "Mesa", "Estado"],
      filas: reservas.map((r) => [
        dia(r.fechaHora),
        horaCorta(r.fechaHora),
        r.nombre,
        r.personas,
        r.mesaNumero ?? "—",
        r.estado === "activa" ? "Activa" : "Cancelada",
      ]),
    }),
  },
];

export default function Listados() {
  const [desde, setDesde] = useState(hoyIso());
  const [hasta, setHasta] = useState(hoyIso());
  const [reporteId, setReporteId] = useState(REPORTES[0].id);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const reporte = REPORTES.find((r) => r.id === reporteId);

  async function generar() {
    setError("");
    setCargando(true);
    try {
      const d0 = new Date(desde + "T00:00:00");
      const d1 = new Date(hasta + "T23:59:59.999");
      const [pedidos, anulados, cierres, reservas, fichajes, productos] = await Promise.all([
        consultar("pedidos", { where: [["cobradoEn", ">=", d0]] }),
        consultar("pedidos", { where: [["estado", "==", "anulado"]] }),
        consultar("cierres", { orden: [["fecha", "desc"]], limite: 300 }),
        consultar("reservas"),
        consultar("fichajes", { orden: [["fecha", "desc"]], limite: 1000 }),
        consultar("productos"),
      ]);
      setDatos({
        cobrados: pedidos.filter((p) => p.estado === "cobrado" && enRango(p.cobradoEn, d0, d1)),
        anulados: anulados.filter((p) => !p.unidoA && enRango(p.anuladoEn, d0, d1)),
        cierres: cierres.filter((c) => enRango(c.fecha, d0, d1)),
        reservas: reservas.filter((r) => enRango(r.fechaHora, d0, d1)),
        fichajes: fichajes.filter((f) => enRango(f.fecha, d0, d1)),
        productos,
      });
    } catch (e) {
      setError("No se pudieron cargar los datos: " + e.message);
    } finally {
      setCargando(false);
    }
  }

  const resultado = datos ? reporte.armar(datos) : null;

  return (
    <section className="stack">
      <div>
        <h2>Listados</h2>
        <p>Elegí el rango de fechas y el reporte.</p>
      </div>

      <div className="card">
        <div className="formulario">
          <label>
            <span className="check">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            <span className="check">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        <button className="btn primary bloque" disabled={cargando} onClick={generar}>
          {cargando ? "Cargando..." : "Generar datos"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <div className="chips">
          {REPORTES.map((r) => (
            <button
              key={r.id}
              className={"chip" + (r.id === reporteId ? " activo" : "")}
              onClick={() => setReporteId(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card listado-imprimible">
        <div className="no-imprimir" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{reporte.label}</h3>
          <button className="btn" disabled={!resultado} onClick={() => window.print()}>Imprimir</button>
        </div>

        {!resultado && <p style={{ marginTop: 12 }}>Tocá "Generar datos" para ver el reporte.</p>}

        {resultado && resultado.filas.length === 0 && (
          <p style={{ marginTop: 12 }}>No hay datos en este rango.</p>
        )}

        {resultado && resultado.filas.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="tabla">
              <thead>
                <tr>
                  {resultado.columnas.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {resultado.filas.map((fila, idx) => (
                  <tr key={idx}>
                    {fila.map((celda, j) => <td key={j}>{celda}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
