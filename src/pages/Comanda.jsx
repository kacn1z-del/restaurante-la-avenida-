import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { ESTADO_MESA, ESTADO_PEDIDO, TIPO_PRODUCTO } from "../lib/constants.js";
import { colones, nuevoId } from "../lib/format.js";
import Cobro from "../components/Cobro.jsx";

export default function Comanda({ pedidoId, onVolver }) {
  const [pedido, setPedido] = useState(null);
  const [productos, setProductos] = useState([]);
  const [observaciones, setObservaciones] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () =>
      onSnapshot(doc(db, "pedidos", pedidoId), (snap) => {
        if (!snap.exists()) return onVolver();
        const data = { id: snap.id, ...snap.data() };
        if (data.estado === ESTADO_PEDIDO.COBRADO || data.estado === ESTADO_PEDIDO.ANULADO) {
          return onVolver();
        }
        setPedido(data);
      }),
    [pedidoId, onVolver]
  );

  useEffect(
    () =>
      onSnapshot(query(collection(db, "productos"), orderBy("posicion")), (snap) => {
        setProductos(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => p.activo !== false && p.tipo !== TIPO_PRODUCTO.INGREDIENTE)
        );
      }),
    []
  );

  useEffect(
    () =>
      onSnapshot(collection(db, "observaciones"), (snap) => {
        setObservaciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    []
  );

  if (!pedido) return <p className="cargando">Cargando pedido...</p>;

  const items = pedido.items || [];
  const hayNuevos = items.some((i) => !i.enviado);
  const hayEnviados = items.some((i) => i.enviado);
  const sel = items.find((i) => i.id === seleccionado);

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const categorias = [...new Set(productosFiltrados.map((p) => p.categoria || "Otros"))];

  async function guardarItems(nuevos, estado) {
    setError("");
    const total = nuevos.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const data = { items: nuevos, total };
    if (estado) data.estado = estado;
    try {
      await updateDoc(doc(db, "pedidos", pedidoId), data);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
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
    const nuevos = items.map((i) => (i.enviado ? i : { ...i, enviado: true, listo: false }));
    await guardarItems(nuevos, ESTADO_PEDIDO.EN_COCINA);
  }

  async function liberarMesa() {
    if (hayEnviados) return;
    if (!confirm("¿Liberar la mesa? El pedido quedará anulado.")) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "pedidos", pedidoId), { estado: ESTADO_PEDIDO.ANULADO });
      batch.update(doc(db, "mesas", pedido.mesaId), {
        estado: ESTADO_MESA.LIBRE,
        pedidoActivoId: null,
      });
      await batch.commit();
      onVolver();
    } catch (e) {
      setError("No se pudo liberar la mesa: " + e.message);
    }
  }

  return (
    <div className="app">
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
                  <small>No hay observaciones. Agregalas en la pestaña Productos.</small>
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
          {!hayEnviados && (
            <button className="btn peligro bloque" onClick={liberarMesa}>
              Liberar mesa
            </button>
          )}
        </section>
      </div>

      {cobrando && (
        <Cobro
          pedido={pedido}
          productos={productos}
          onCerrado={onVolver}
          onCancelar={() => setCobrando(false)}
        />
      )}
    </div>
  );
}
