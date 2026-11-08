import { horaCorta } from "../lib/format.js";

// Comanda de una sola zona (cocina o barra), lista para imprimir en la impresora térmica
export default function ComandaImpresa({ zona, items, mesaNumero, empleado, onCerrar }) {
  const titulo = zona === "barra" ? "BARRA" : "COCINA";

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <div className="comanda-imprimible">
          <div className="centro"><strong>{titulo}</strong></div>
          <div className="centro">Mesa {mesaNumero} · {horaCorta(new Date())}</div>
          <div>Atendió: {empleado || "—"}</div>

          <hr />

          {items.map((i) => (
            <div key={i.id} className="cimp-item">
              <div><strong>{i.cantidad} × {i.nombre}</strong></div>
              {i.orden && <div>Orden: {i.orden}</div>}
              {i.observaciones?.length > 0 && <div>{i.observaciones.join(", ")}</div>}
            </div>
          ))}
        </div>

        <div className="acciones no-imprimir">
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
          <button className="btn primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
