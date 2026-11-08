import { useState } from "react";
import { actualizar, ahora, confirmar, consultar, crear, incremento, nuevoIdDoc, usePolling } from "../lib/api.js";
import { ROL } from "../lib/constants.js";
import { colones } from "../lib/format.js";

const ESTADO = { REGISTRADA: "registrada", ANULADA: "anulada" };

const hoyISO = () => new Date().toISOString().slice(0, 10);
const LINEA_VACIA = { productoId: "", cantidad: "", costo: "" };

export default function Compras({ staff }) {
  const [proveedor, setProveedor] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }]);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  const productosQ = usePolling(() => consultar("productos", { orden: [["posicion"]] }), [], 30000);
  const comprasQ = usePolling(
    () => consultar("compras", { orden: [["creadoEn", "desc"]], limite: 50 }),
    [],
    15000
  );

  const productos = (productosQ.datos || []).filter((p) => p.activo !== false);
  const compras = comprasQ.datos || [];
  const esAdmin = staff.rol === ROL.ADMIN;

  const total = lineas.reduce(
    (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costo) || 0),
    0
  );

  function cambiarLinea(idx, cambios) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...cambios } : l)));
  }

  function quitarLinea(idx) {
    setLineas((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }

  async function registrar(e) {
    e.preventDefault();
    setMsg("");

    if (!proveedor.trim() || !numeroFactura.trim()) {
      setMsg("Completá proveedor y número de factura.");
      return;
    }
    const validas = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0);
    if (validas.length === 0) {
      setMsg("Agregá al menos una línea con producto y cantidad.");
      return;
    }

    setGuardando(true);
    try {
      const items = validas.map((l) => {
        const prod = productos.find((p) => p.id === l.productoId);
        const cantidad = Number(l.cantidad);
        const costoUnitario = Number(l.costo) || 0;
        return {
          productoId: l.productoId,
          nombre: prod?.nombre || "",
          cantidad,
          costoUnitario,
          subtotal: cantidad * costoUnitario,
        };
      });

      const compraId = nuevoIdDoc();
      const escrituras = [
        crear("compras", compraId, {
          proveedor: proveedor.trim(),
          numeroFactura: numeroFactura.trim(),
          fecha: new Date(fecha + "T12:00:00"),
          items,
          total: items.reduce((s, i) => s + i.subtotal, 0),
          estado: ESTADO.REGISTRADA,
          creadoPor: staff.uid,
          creadoPorNombre: staff.nombre || "",
          creadoEn: ahora(),
          anuladaPor: null,
          anuladaPorNombre: null,
          anuladaEn: null,
        }),
      ];

      for (const it of items) {
        escrituras.push(
          actualizar("productos", it.productoId, { stockActual: incremento(it.cantidad) })
        );
        escrituras.push(
          crear("movimientos", nuevoIdDoc(), {
            productoId: it.productoId,
            cantidad: it.cantidad,
            motivo: "compra",
            compraId,
            uid: staff.uid,
            fecha: ahora(),
          })
        );
      }

      await confirmar(escrituras);
      setProveedor("");
      setNumeroFactura("");
      setFecha(hoyISO());
      setLineas([{ ...LINEA_VACIA }]);
      setMsg("Compra registrada.");
      comprasQ.recargar();
      productosQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  }

  // Anular no borra la compra: la deja marcada con quién y cuándo, y devuelve el stock.
  async function anular(compra) {
    if (compra.estado === ESTADO.ANULADA) return;
    const texto = `¿Anular la compra de ${compra.proveedor} (factura ${compra.numeroFactura})? ` +
      "El stock se va a descontar. La compra queda registrada como anulada.";
    if (!confirm(texto)) return;

    setMsg("");
    try {
      const escrituras = [
        actualizar("compras", compra.id, {
          estado: ESTADO.ANULADA,
          anuladaPor: staff.uid,
          anuladaPorNombre: staff.nombre || "",
          anuladaEn: ahora(),
        }),
      ];

      for (const it of compra.items || []) {
        escrituras.push(
          actualizar("productos", it.productoId, { stockActual: incremento(-it.cantidad) })
        );
        escrituras.push(
          crear("movimientos", nuevoIdDoc(), {
            productoId: it.productoId,
            cantidad: -it.cantidad,
            motivo: "anulación de compra",
            compraId: compra.id,
            uid: staff.uid,
            fecha: ahora(),
          })
        );
      }

      await confirmar(escrituras);
      setMsg("Compra anulada. El stock se descontó y el registro quedó guardado.");
      comprasQ.recargar();
      productosQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  return (
    <div className="stack">
      {msg && <p className="ok">{msg}</p>}

      <section className="card">
        <h2>Registrar compra</h2>
        <form onSubmit={registrar} className="stack">
          <div className="formulario">
            <input
              placeholder="Proveedor"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              required
            />
            <input
              placeholder="Número de factura"
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
              required
            />
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          <h3>Líneas</h3>
          {lineas.map((l, idx) => (
            <div className="pago-fila" key={idx}>
              <select
                value={l.productoId}
                onChange={(e) => cambiarLinea(idx, { productoId: e.target.value })}
              >
                <option value="">— producto —</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Cant."
                value={l.cantidad}
                onChange={(e) => cambiarLinea(idx, { cantidad: e.target.value })}
              />
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Costo ₡"
                value={l.costo}
                onChange={(e) => cambiarLinea(idx, { costo: e.target.value })}
              />
              <button type="button" className="btn peligro" onClick={() => quitarLinea(idx)}>×</button>
            </div>
          ))}

          <button
            type="button"
            className="btn"
            onClick={() => setLineas([...lineas, { ...LINEA_VACIA }])}
          >
            + Línea
          </button>

          <p><strong>Total: {colones(total)}</strong></p>

          <div className="acciones">
            <button className="btn primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar compra"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Compras</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Factura</th>
              <th>Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => {
              const anulada = c.estado === ESTADO.ANULADA;
              return (
                <tr key={c.id} style={{ opacity: anulada ? 0.6 : 1 }}>
                  <td>{c.fecha instanceof Date ? c.fecha.toLocaleDateString("es-CR") : "—"}</td>
                  <td>{c.proveedor}</td>
                  <td>{c.numeroFactura}</td>
                  <td>{colones(c.total)}</td>
                  <td>
                    {anulada ? (
                      <>
                        <span className="error">Anulada</span>
                        {c.anuladaPorNombre && <small> · {c.anuladaPorNombre}</small>}
                      </>
                    ) : (
                      "Registrada"
                    )}
                  </td>
                  <td>
                    {esAdmin && !anulada && (
                      <button className="btn peligro" onClick={() => anular(c)}>Anular</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <small>Las compras anuladas se conservan en el registro.</small>
      </section>
    </div>
  );
}
