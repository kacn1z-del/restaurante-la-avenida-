import { METODOS_PAGO } from "../lib/constants.js";
import { colones } from "../lib/format.js";

const ESTILOS = `
.ticket-imprimible {
  font-family: monospace;
  font-size: 12px;
  background: #fff;
  color: #000;
  padding: 8px;
  width: 72mm;
  max-width: 100%;
  margin: 0 auto;
}
.ticket-imprimible table { width: 100%; border-collapse: collapse; }
.ticket-imprimible td { padding: 2px 0; vertical-align: top; }
.ticket-imprimible .r { text-align: right; }
.ticket-imprimible .centro { text-align: center; }
.ticket-imprimible hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
@media print {
  body * { visibility: hidden; }
  .ticket-imprimible, .ticket-imprimible * { visibility: visible; }
  .ticket-imprimible {
    position: fixed;
    left: 0;
    top: 0;
    width: 72mm;
    margin: 0;
  }
  .no-imprimir { display: none !important; }
}
`;

function nombreMetodo(id) {
  return METODOS_PAGO.find((m) => m.id === id)?.label || id;
}

export default function Ticket({ pedido, pagos = [], fecha, onCerrar, precuenta = false }) {
  const items = pedido.items || [];
  const total = Math.round(Number(pedido.total) || 0);

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <style>{ESTILOS}</style>

        <div className="ticket-imprimible">
          <div className="centro"><strong>{precuenta ? "PRECUENTA" : "RESTAURANTE LA AVENIDA"}</strong></div>
          {precuenta && <div className="centro">No es factura</div>}
          <div className="centro">
            Mesa {pedido.mesaNumero} · {fecha.toLocaleString("es-CR")}
          </div>
          <div>Atendió: {pedido.empleadoNombre || "—"}</div>

          <hr />

          <table>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.cantidad} × {i.nombre}
                    {i.observaciones?.length > 0 && <div>{i.observaciones.join(", ")}</div>}
                  </td>
                  <td className="r">{colones(i.precio * i.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr />

          <table>
            <tbody>
              <tr>
                <td><strong>TOTAL</strong></td>
                <td className="r"><strong>{colones(total)}</strong></td>
              </tr>
              {!precuenta && pagos.map((p, idx) => (
                <tr key={idx}>
                  <td>{nombreMetodo(p.metodo)}</td>
                  <td className="r">{colones(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr />

          <div className="centro">¡Gracias por su visita!</div>
        </div>

        <div className="acciones no-imprimir">
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
          <button className="btn primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
