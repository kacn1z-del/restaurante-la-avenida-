import { useEffect, useRef, useState } from "react";
import { actualizar, ahora, confirmar, consultar, leerDoc, usePolling } from "../lib/api.js";
import { ESTADO_MESA, ESTADO_PEDIDO, OPCIONES_ORDEN_SERVICIO, ROL, TIPO_PRODUCTO } from "../lib/constants.js";
import { colones, nuevoId } from "../lib/format.js";
import Cobro from "../components/Cobro.jsx";
import Ticket from "../components/Ticket.jsx";
import Juntar from "../components/Juntar.jsx";
import ComandaImpresa from "../components/ComandaImpresa.jsx";

export default function Comanda({ pedidoId, onVolver, staff }) {
  const [pedido, setPedido] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [juntando, setJuntando] = useState(false);
  const [preticket, setPreticket] = useState(false);
  const [error, setError] = useState("");
  const [comandas, setComandas] = useState(null); // { zonas, items } tras enviar a cocina
  const [imprimirZona, setImprimirZona] = useState(null); // { zona, items }
  // Cantidad de guardados en curso: mientras haya uno, no se pisa el pedido local con datos viejos
  const guardandoRef = useRef(0);

  const pedidoQ = usePolling(
    async () => {
      const datos = await leerDoc("pedidos", pedidoId);
      return { existe: !!datos, datos };
    },
    [pedidoId],
    3000
  );
  const productosQ = usePolling(() => consultar("productos", { orden: [["posicion"]] }), [], 15000);
  const observacionesQ = usePolling(() => consultar("observaciones"), [], 15000);

  useEffect(() => {
    const r = pedidoQ.datos;
    if (!r) return;
    if (!r.existe || r.datos.estado === ESTADO_PEDIDO.COBRADO || r.datos.estado === ESTADO_PEDIDO.ANULADO) {
      onVolver();
      return;
    }
    if (guardandoRef.current === 0) setPedido(r.datos);
  }, [pedidoQ.datos, onVolver]);

  if (!pedido) return <p className="cargando">Cargando pedido...</p>;

  const productos = (productosQ.datos || []).filter(
    (p) => p.activo !== false && p.tipo !== TIPO_PRODUCTO.INGREDIENTE
  );
  const observaciones = observacionesQ.datos || [];

  const items = pedido.items || [];
  const hayNuevos = items.some((i) => !i.enviado);
  const hayEnviados = items.some((i) => i.enviado);
  const sel = items.find((i) => i.id === seleccionado);
  const esAdmin = staff?.rol === ROL.ADMIN;

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const categorias = [...new Set(productosFiltrados.map((p) => p.categoria || "Otros"))];

  async function guardarItems(nuevos, estado) {
    setError("");
    const total = nuevos.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const datos = { items: nuevos, total };
    if (estado) datos.estado = estado;

    // Se muestra de inmediato; el servidor se actualiza después
    setPedido((p) => (p ? { ...p, ...datos } : p));
    guardandoRef.current += 1;
    try {
      await confirmar([actualizar("pedidos", pedidoId, datos)]);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
    } finally {
      guardandoRef.current -= 1;
      pedidoQ.recargar();
    }
  }

  function agregar(prod) {
    const nuevos = [...items];
    const idx = nuevos.findIndex(
      (i) => i.productoId === prod.id && !i.enviado && !(i.observaciones?.length)
    );
    if (idx >= 0) {
      nuevos[idx] = { ...nuevos[idx], cantidad: nuevos[idx].cantidad + 1 };
    } else {
      nuevos.push({
        id: nuevoId(),
        productoId: prod.id,
        nombre: prod.nombre,
        precio: Number(prod.precio) || 0,
        cantidad: 1,
        zona: prod.zona || "cocina",
        observaciones: [],
        enviado: false,
        listo: false,
      });
    }
    guardarItems(nuevos);
  }

  function cambiarCantidad(id, delta) {
    const nuevos = items.flatMap((i) => {
      if (i.id !== id || i.enviado) return [i];
      const cantidad = i.cantidad + delta;
      return cantidad > 0 ? [{ ...i, cantidad }] : [];
    });
    guardarItems(nuevos);
    if (seleccionado === id && !nuevos.some((i) => i.id === id)) setSeleccionado(null);
  }

  function setOrden(id, valor) {
    const nuevos = items.map((i) => {
      if (i.id !== id || i.enviado) return i;
      return { ...i, orden: i.orden === valor ? null : valor };
    });
    guardarItems(nuevos);
  }

  function toggleObs(id, texto) {
    const nuevos = items.map((i) => {
      if (i.id !== id || i.enviado) return i;
      const obs = i.observaciones || [];
      return {
        ...i,
        observaciones: obs.includes(texto) ? obs.filter((o) => o !== texto) : [...obs, texto],
      };
    });
    guardarItems(nuevos);
  }

  async function enviarACocina() {
    if (!hayNuevos) return;
    const recien = items.filter((i) => !i.enviado);
    const nuevos = items.map((i) => (i.enviado ? i : { ...i, enviado: true, listo: false }));
    await guardarItems(nuevos, ESTADO_PEDIDO.EN_COCINA);
    // Se ofrece imprimir una comanda por cada zona que tenga productos nuevos
    const zonas = [...new Set(recien.map((i) => i.zona || "cocina"))];
    setComandas({ zonas, items: recien });
  }

  async function liberarMesa() {
    if (hayEnviados) return;
    if (!confirm("¿Liberar la mesa? El pedido quedará anulado.")) return;
    try {
      await confirmar([
        actualizar("pedidos", pedidoId, { estado: ESTADO_PEDIDO.ANULADO }),
        actualizar("mesas", pedido.mesaId, { estado: ESTADO_MESA.LIBRE, pedidoActivoId: null }),
      ]);
      onVolver();
    } catch (e) {
      setError("No se pudo liberar la mesa: " + e.message);
    }
  }

  // Solo admin: borra la venta aunque ya esté en cocina, dejando motivo y quién la borró
  async function borrarVenta() {
    const motivo = window.prompt("Motivo para borrar la venta (queda registrado):", "");
    if (motivo === null) return;
    if (!motivo.trim()) {
      setError("Escribí un motivo para borrar la venta.");
      return;
    }
    try {
      await confirmar([
        actualizar("pedidos", pedidoId, {
          estado: ESTADO_PEDIDO.ANULADO,
          anuladoPor: staff.uid,
          anuladoPorNombre: staff.nombre || "",
          anuladoEn: ahora(),
          motivoAnulacion: motivo.trim(),
        }),
        actualizar("mesas", pedido.mesaId, { estado: ESTADO_MESA.LIBRE, pedidoActivoId: null }),
      ]);
      onVolver();
    } catch (e) {
      setError("No se pudo borrar la venta: " + e.message);
    }
  }

  // Tras un cobro parcial la comanda sigue abierta con lo que falta; tras un cobro total se vuelve al salón
  function alCerrarCobro(resultado) {
    if (resultado?.parcial) {
      setCobrando(false);
      pedidoQ.recargar();
      return;
    }
    onVolver();
  }

  return (
    <div className="app-comanda">
      <header className="topbar">
        <button className="btn" onClick={onVolver}>← Salón</button>
        <strong>Mesa {pedido.mesaNumero}</strong>
        <span>{pedido.empleadoNombre}</span>
      </header>

      {error && <p className="error" style={{ padding: "0 16px" }}>{error}</p>}

      <div className="comanda-body">
        <section>
          <input
            className="buscar"
            placeholder="Buscar producto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {categorias.map((cat) => (
            <div key={cat}>
              <h3>{cat}</h3>
              <div className="grid-productos">
                {productosFiltrados
                  .filter((p) => (p.categoria || "Otros") === cat)
                  .map((p) => (
                    <button key={p.id} className="producto" onClick={() => agregar(p)}>
                      <span>{p.nombre}</span>
                      <small>{colones(p.precio)}</small>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>

        <section className="cuenta">
          <h3>Cuenta</h3>
          {items.length === 0 && <p>Sin productos todavía.</p>}

          {items.map((i) => (
            <div
              key={i.id}
              className={"item" + (i.id === seleccionado ? " sel" : "") + (i.enviado ? " enviado" : "")}
              onClick={() => setSeleccionado(i.id)}
            >
              <div className="item-linea">
                <span>{i.cantidad} × {i.nombre}</span>
                <span>{colones(i.precio * i.cantidad)}</span>
              </div>
              {i.orden && <small>Orden: {i.orden}</small>}
              {i.observaciones?.length > 0 && <small>{i.observaciones.join(", ")}</small>}
              <div className="item-acciones">
                {i.enviado ? (
                  <small>Enviado · {i.listo ? "listo" : "en cocina"}</small>
                ) : (
                  <>
                    <button
                      className="btn"
                      onClick={(e) => { e.stopPropagation(); cambiarCantidad(i.id, -1); }}
                    >
                      −
                    </button>
                    <button
                      className="btn"
                      onClick={(e) => { e.stopPropagation(); cambiarCantidad(i.id, 1); }}
                    >
                      +
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {sel && !sel.enviado && (
            <div className="observaciones">
              <h4>Orden de servicio</h4>
              <div className="chips" style={{ marginBottom: 12 }}>
                {OPCIONES_ORDEN_SERVICIO.map((o) => (
                  <button
                    key={o}
                    className={"chip" + (sel.orden === o ? " activo" : "")}
                    onClick={() => setOrden(sel.id, o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <h4>Observaciones de {sel.nombre}</h4>
              <div className="chips">
                {observaciones.map((o) => (
                  <button
                    key={o.id}
                    className={"chip" + (sel.observaciones?.includes(o.texto) ? " activo" : "")}
                    onClick={() => toggleObs(sel.id, o.texto)}
                  >
                    {o.texto}
                  </button>
                ))}
                {observaciones.length === 0 && (
                  <small>No hay observaciones. Agregalas en la pestaña Menú.</small>
                )}
              </div>
            </div>
          )}

          <div className="total">
            <span>Total</span>
            <strong>{colones(pedido.total)}</strong>
          </div>

          <button className="btn primary bloque" disabled={!hayNuevos} onClick={enviarACocina}>
            Enviar a cocina
          </button>
          <button className="btn bloque" disabled={items.length === 0} onClick={() => setCobrando(true)}>
            Cobrar
          </button>
          <button className="btn bloque" disabled={items.length === 0} onClick={() => setPreticket(true)}>
            Preticket
          </button>
          <button className="btn bloque" disabled={items.length === 0} onClick={() => setJuntando(true)}>
            Juntar con otra mesa
          </button>
          {!hayEnviados && (
            <button className="btn peligro bloque" onClick={liberarMesa}>
              Liberar mesa
            </button>
          )}
          {esAdmin && (
            <button className="btn peligro bloque" onClick={borrarVenta}>
              Borrar venta
            </button>
          )}
        </section>
      </div>

      {cobrando && (
        <Cobro
          pedido={pedido}
          productos={productos}
          onCerrado={alCerrarCobro}
          onCancelar={() => setCobrando(false)}
        />
      )}

      {comandas && !imprimirZona && (
        <div className="modal-fondo">
          <div className="modal card">
            <h2>Comandas listas</h2>
            <p>Imprimí una comanda por cada zona.</p>
            {comandas.zonas.map((z) => (
              <button
                key={z}
                className="btn primary bloque"
                onClick={() =>
                  setImprimirZona({
                    zona: z,
                    items: comandas.items.filter((i) => (i.zona || "cocina") === z),
                  })
                }
              >
                Comanda de {z === "barra" ? "barra" : "cocina"}
              </button>
            ))}
            <button className="btn bloque" onClick={() => setComandas(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {imprimirZona && (
        <ComandaImpresa
          zona={imprimirZona.zona}
          items={imprimirZona.items}
          mesaNumero={pedido.mesaNumero}
          empleado={pedido.empleadoNombre}
          onCerrar={() => setImprimirZona(null)}
        />
      )}

      {preticket && (
        <Ticket
          pedido={pedido}
          fecha={new Date()}
          precuenta
          onCerrar={() => setPreticket(false)}
        />
      )}

      {juntando && (
        <Juntar
          pedido={pedido}
          onCancelar={() => setJuntando(false)}
          onJuntado={onVolver}
        />
      )}
    </div>
  );
}
