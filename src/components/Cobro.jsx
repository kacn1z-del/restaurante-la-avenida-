import { useState } from "react";
import { actualizar, ahora, confirmar, crear, incremento, nuevoIdDoc } from "../lib/api.js";
import { ESTADO_MESA, ESTADO_PEDIDO, METODOS_PAGO } from "../lib/constants.js";
import { colones } from "../lib/format.js";
import Ticket from "./Ticket.jsx";

function sumar(items) {
  return items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0);
}

export default function Cobro({ pedido, productos, onCerrado, onCancelar }) {
  const itemsPedido = pedido.items || [];
  const [parcial, setParcial] = useState(false);
  const [seleccion, setSeleccion] = useState(() => itemsPedido.map((i) => i.id));
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: Math.round(sumar(itemsPedido)) }]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cobrado, setCobrado] = useState(null); // { pedido, pagos, fecha, parcial } tras cobrar

  // Productos que se cobran ahora
  const itemsCobro = parcial ? itemsPedido.filter((i) => seleccion.includes(i.id)) : itemsPedido;
  const restantes = parcial ? itemsPedido.filter((i) => !seleccion.includes(i.id)) : [];
  // Si se eligen todos los productos, es un cobro total normal
  const esParcial = parcial && itemsCobro.length > 0 && restantes.length > 0;
  const total = Math.round(sumar(itemsCobro));

  const suma = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const falta = total - Math.round(suma);
  const cuadra = total > 0 && falta === 0;

  // Al cambiar qué se cobra, si hay un solo pago se ajusta al nuevo total
  function reajustarPagos(nuevaSeleccion, nuevoParcial) {
    const base = nuevoParcial
      ? itemsPedido.filter((i) => nuevaSeleccion.includes(i.id))
      : itemsPedido;
    const nuevo = Math.round(sumar(base));
    setPagos((prev) => (prev.length === 1 ? [{ metodo: prev[0].metodo, monto: nuevo }] : prev));
  }

  function alternarItem(id) {
    const nueva = seleccion.includes(id)
      ? seleccion.filter((x) => x !== id)
      : [...seleccion, id];
    setSeleccion(nueva);
    reajustarPagos(nueva, parcial);
  }

  function cambiarModo(esParcialNuevo) {
    setParcial(esParcialNuevo);
    const nuevaSeleccion = esParcialNuevo ? [] : itemsPedido.map((i) => i.id);
    setSeleccion(nuevaSeleccion);
    reajustarPagos(nuevaSeleccion, esParcialNuevo);
  }

  function cambiarPago(idx, cambios) {
    setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, ...cambios } : p)));
  }

  function agregarPago() {
    const usados = pagos.map((p) => p.metodo);
    const metodo = METODOS_PAGO.find((m) => !usados.includes(m.id))?.id || "efectivo";
    setPagos([...pagos, { metodo, monto: Math.max(falta, 0) }]);
  }

  function quitarPago(idx) {
    setPagos(pagos.filter((_, i) => i !== idx));
  }

  async function cobrar() {
    setError("");
    if (!cuadra) {
      setError("La suma de los pagos debe ser igual al total.");
      return;
    }
    setGuardando(true);
    try {
      const itemsCobrados = itemsCobro.map((i) => ({ ...i, enviado: true, listo: true }));
      const pagosCobrados = pagos.map((p) => ({
        metodo: p.metodo,
        monto: Math.round(Number(p.monto)),
      }));

      let idVenta = pedido.id;
      const escrituras = [];

      if (esParcial) {
        // Cobro parcial: se crea una venta nueva con lo cobrado y la cuenta original queda con lo que falta
        idVenta = nuevoIdDoc();
        escrituras.push(
          crear("pedidos", idVenta, {
            mesaId: pedido.mesaId,
            mesaNumero: pedido.mesaNumero,
            salonId: pedido.salonId ?? null,
            empleadoUid: pedido.empleadoUid ?? null,
            empleadoNombre: pedido.empleadoNombre || "",
            estado: ESTADO_PEDIDO.COBRADO,
            items: itemsCobrados,
            total,
            pagos: pagosCobrados,
            creadoEn: ahora(),
            cobradoEn: ahora(),
            cobroParcialDe: pedido.id,
          }),
          actualizar("pedidos", pedido.id, {
            items: restantes,
            total: Math.round(sumar(restantes)),
          })
        );
      } else {
        escrituras.push(
          actualizar("pedidos", pedido.id, {
            estado: ESTADO_PEDIDO.COBRADO,
            items: itemsCobrados,
            total,
            pagos: pagosCobrados,
            cobradoEn: ahora(),
          }),
          actualizar("mesas", pedido.mesaId, {
            estado: ESTADO_MESA.LIBRE,
            pedidoActivoId: null,
          })
        );
      }

      // Descuento de inventario solo por lo que se cobró
      for (const item of itemsCobro) {
        const prod = productos.find((p) => p.id === item.productoId);
        if (!prod) continue;

        if (prod.ingredientes?.length) {
          for (const ing of prod.ingredientes) {
            const cantidad = Number(ing.cantidad) * item.cantidad;
            escrituras.push(
              actualizar("productos", ing.productoId, { stockActual: incremento(-cantidad) })
            );
            escrituras.push(
              crear("movimientos", nuevoIdDoc(), {
                productoId: ing.productoId,
                cantidad: -cantidad,
                motivo: "venta",
                pedidoId: idVenta,
                fecha: ahora(),
              })
            );
          }
        } else if (prod.controlaStock) {
          escrituras.push(
            actualizar("productos", prod.id, { stockActual: incremento(-item.cantidad) })
          );
          escrituras.push(
            crear("movimientos", nuevoIdDoc(), {
              productoId: prod.id,
              cantidad: -item.cantidad,
              motivo: "venta",
              pedidoId: idVenta,
              fecha: ahora(),
            })
          );
        }
      }

      await confirmar(escrituras);
      // Se muestra el ticket con los datos ya cobrados; al cerrar se vuelve a la comanda o al salón
      setCobrado({
        pedido: { ...pedido, id: idVenta, items: itemsCobrados, total },
        pagos: pagosCobrados,
        fecha: new Date(),
        parcial: esParcial,
      });
    } catch (e) {
      setError("No se pudo cobrar: " + e.message);
      setGuardando(false);
    }
  }

  if (cobrado) {
    return (
      <Ticket
        pedido={cobrado.pedido}
        pagos={cobrado.pagos}
        fecha={cobrado.fecha}
        onCerrar={() => onCerrado({ parcial: cobrado.parcial })}
      />
    );
  }

  return (
    <div className="modal-fondo">
      <div className="modal card">
        <h2>Cobrar mesa {pedido.mesaNumero}</h2>

        <div className="chips">
          <button
            className={"chip" + (!parcial ? " activo" : "")}
            onClick={() => cambiarModo(false)}
          >
            Cobrar todo
          </button>
          <button
            className={"chip" + (parcial ? " activo" : "")}
            onClick={() => cambiarModo(true)}
          >
            Cobro parcial
          </button>
        </div>

        {parcial && (
          <div>
            <h3>Elegí lo que se cobra ahora</h3>
            {itemsPedido.length === 0 && <p>No hay productos en la cuenta.</p>}
            {itemsPedido.map((i) => (
              <div
                key={i.id}
                className={"item" + (seleccion.includes(i.id) ? " sel" : "")}
                onClick={() => alternarItem(i.id)}
              >
                <div className="item-linea">
                  <span>{i.cantidad} × {i.nombre}</span>
                  <span>{colones(i.precio * i.cantidad)}</span>
                </div>
              </div>
            ))}
            {parcial && restantes.length === 0 && itemsCobro.length > 0 && (
              <small>Elegiste todos los productos: se cobra la cuenta completa.</small>
            )}
          </div>
        )}

        <p className="total-grande">Total {colones(total)}</p>

        {pagos.map((p, idx) => (
          <div className="pago-fila" key={idx}>
            <select
              value={p.metodo}
              onChange={(e) => cambiarPago(idx, { metodo: e.target.value })}
            >
              {METODOS_PAGO.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={p.monto}
              onChange={(e) => cambiarPago(idx, { monto: e.target.value })}
            />
            {pagos.length > 1 && (
              <button className="btn peligro" onClick={() => quitarPago(idx)}>×</button>
            )}
          </div>
        ))}

        <button className="btn" onClick={agregarPago} disabled={falta <= 0}>
          + Agregar otro método
        </button>

        <p className={cuadra ? "ok" : "error"}>
          Pagado {colones(suma)} ·{" "}
          {falta > 0 ? `Faltan ${colones(falta)}` : falta < 0 ? `Sobran ${colones(-falta)}` : "Cuadra"}
        </p>

        {esParcial && (
          <small>Queda en la cuenta: {colones(sumar(restantes))}</small>
        )}

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <button className="btn" onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button className="btn primary" disabled={!cuadra || guardando} onClick={cobrar}>
            {guardando ? "Cobrando..." : esParcial ? "Cobrar parcial" : "Cobrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
