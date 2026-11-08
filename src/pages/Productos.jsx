import { useState } from "react";
import {
  actualizar,
  ahora,
  borrar,
  confirmar,
  consultar,
  crear,
  nuevoIdDoc,
  usePolling,
} from "../lib/api.js";
import { ESTADO_MESA, TIPO_PRODUCTO, ZONA } from "../lib/constants.js";
import { colones } from "../lib/format.js";

const FORM_VACIO = {
  nombre: "",
  categoria: "",
  precio: "",
  tipo: TIPO_PRODUCTO.VENTA,
  zona: ZONA.COCINA,
  posicion: "",
  unidad: "Unidades",
  cabys: "",
  stockActual: "",
  stockMinimo: "",
  controlaStock: false,
  ingredientes: [],
};

export default function Productos() {
  const [form, setForm] = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [nuevoSalon, setNuevoSalon] = useState("");
  const [salonElegido, setSalonElegido] = useState("");
  const [inicioMesa, setInicioMesa] = useState(1);
  const [cantMesas, setCantMesas] = useState(10);
  const [nuevaObs, setNuevaObs] = useState("");
  const [msg, setMsg] = useState("");

  const productosQ = usePolling(() => consultar("productos", { orden: [["posicion"]] }), [], 15000);
  const salonesQ = usePolling(() => consultar("salones", { orden: [["orden"]] }), [], 15000);
  const obsQ = usePolling(() => consultar("observaciones"), [], 15000);

  const productos = productosQ.datos || [];
  const salones = salonesQ.datos || [];
  const observaciones = obsQ.datos || [];

  function recargarTodo() {
    productosQ.recargar();
    salonesQ.recargar();
    obsQ.recargar();
  }

  const ingredientes = productos.filter((p) => p.tipo === TIPO_PRODUCTO.INGREDIENTE);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function cambiarIng(idx, cambios) {
    setForm((f) => ({
      ...f,
      ingredientes: f.ingredientes.map((ing, i) => (i === idx ? { ...ing, ...cambios } : ing)),
    }));
  }

  function quitarIng(idx) {
    setForm((f) => ({ ...f, ingredientes: f.ingredientes.filter((_, i) => i !== idx) }));
  }

  function editar(p) {
    setEditandoId(p.id);
    setForm({
      ...FORM_VACIO,
      nombre: p.nombre || "",
      categoria: p.categoria || "",
      precio: String(p.precio ?? ""),
      tipo: p.tipo || TIPO_PRODUCTO.VENTA,
      zona: p.zona || ZONA.COCINA,
      posicion: String(p.posicion ?? ""),
      unidad: p.unidad || "Unidades",
      cabys: p.cabys || "",
      stockActual: String(p.stockActual ?? ""),
      stockMinimo: String(p.stockMinimo ?? ""),
      controlaStock: !!p.controlaStock,
      ingredientes: p.ingredientes || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limpiar() {
    setEditandoId(null);
    setForm(FORM_VACIO);
  }

  async function guardarProducto(e) {
    e.preventDefault();
    setMsg("");
    const data = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || "Otros",
      precio: Number(form.precio) || 0,
      tipo: form.tipo,
      zona: form.zona,
      posicion: Number(form.posicion) || 0,
      unidad: form.unidad,
      cabys: form.cabys.trim(),
      tarifaCodigo: "08",
      stockActual: Number(form.stockActual) || 0,
      stockMinimo: Number(form.stockMinimo) || 0,
      controlaStock: form.controlaStock,
      ingredientes: form.ingredientes
        .filter((i) => i.productoId && Number(i.cantidad) > 0)
        .map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
    };
    try {
      if (editandoId) {
        await confirmar([actualizar("productos", editandoId, data)]);
      } else {
        await confirmar([
          crear("productos", nuevoIdDoc(), { ...data, activo: true, creadoEn: ahora() }),
        ]);
      }
      setMsg("Producto guardado.");
      limpiar();
      recargarTodo();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  async function toggleActivo(p) {
    try {
      await confirmar([actualizar("productos", p.id, { activo: !(p.activo !== false) })]);
      productosQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  async function crearSalon(e) {
    e.preventDefault();
    if (!nuevoSalon.trim()) return;
    try {
      await confirmar([
        crear("salones", nuevoIdDoc(), {
          nombre: nuevoSalon.trim(),
          orden: salones.length + 1,
        }),
      ]);
      setNuevoSalon("");
      salonesQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  async function crearMesas(e) {
    e.preventDefault();
    setMsg("");
    if (!salonElegido) {
      setMsg("Elegí un salón.");
      return;
    }
    const escrituras = [];
    for (let i = 0; i < Number(cantMesas); i++) {
      escrituras.push(
        crear("mesas", nuevoIdDoc(), {
          numero: Number(inicioMesa) + i,
          salonId: salonElegido,
          estado: ESTADO_MESA.LIBRE,
          pedidoActivoId: null,
        })
      );
    }
    try {
      await confirmar(escrituras);
      setMsg(`Se crearon ${cantMesas} mesas.`);
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  async function agregarObs(e) {
    e.preventDefault();
    if (!nuevaObs.trim()) return;
    try {
      await confirmar([crear("observaciones", nuevoIdDoc(), { texto: nuevaObs.trim() })]);
      setNuevaObs("");
      obsQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  async function borrarObs(id) {
    try {
      await confirmar([borrar("observaciones", id)]);
      obsQ.recargar();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  }

  return (
    <div className="stack">
      {msg && <p className="ok">{msg}</p>}

      <section className="card">
        <h2>{editandoId ? "Editar producto" : "Nuevo producto"}</h2>
        <form onSubmit={guardarProducto} className="stack">
          <div className="formulario">
            <input placeholder="Nombre" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
            <input placeholder="Categoría (ej. Bebidas)" value={form.categoria} onChange={(e) => set("categoria", e.target.value)} />
            <input type="number" min="0" placeholder="Precio ₡" value={form.precio} onChange={(e) => set("precio", e.target.value)} required />
            <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="venta">Producto para venta</option>
              <option value="ingrediente">Ingrediente</option>
              <option value="ambos">Ambos</option>
            </select>
            <select value={form.zona} onChange={(e) => set("zona", e.target.value)}>
              <option value="cocina">Cocina</option>
              <option value="barra">Barra</option>
            </select>
            <input type="number" placeholder="Posición en menú" value={form.posicion} onChange={(e) => set("posicion", e.target.value)} />
            <input placeholder="Unidad (Unidades, Kg, Litros…)" value={form.unidad} onChange={(e) => set("unidad", e.target.value)} />
            <input placeholder="Código CABYS" value={form.cabys} onChange={(e) => set("cabys", e.target.value)} />
            <input type="number" step="any" placeholder="Stock actual" value={form.stockActual} onChange={(e) => set("stockActual", e.target.value)} />
            <input type="number" step="any" placeholder="Stock mínimo" value={form.stockMinimo} onChange={(e) => set("stockMinimo", e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={form.controlaStock} onChange={(e) => set("controlaStock", e.target.checked)} />
              Descuenta su propio stock al vender
            </label>
          </div>

          <h3>Receta (ingredientes que se descuentan por cada venta)</h3>
          {form.ingredientes.map((ing, idx) => (
            <div className="pago-fila" key={idx}>
              <select value={ing.productoId} onChange={(e) => cambiarIng(idx, { productoId: e.target.value })}>
                <option value="">— elegir ingrediente —</option>
                {ingredientes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input type="number" min="0" step="any" placeholder="Cant." value={ing.cantidad} onChange={(e) => cambiarIng(idx, { cantidad: e.target.value })} />
              <button type="button" className="btn peligro" onClick={() => quitarIng(idx)}>×</button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => set("ingredientes", [...form.ingredientes, { productoId: "", cantidad: 1 }])}>
            + Ingrediente
          </button>

          <div className="acciones">
            {editandoId && <button type="button" className="btn" onClick={limpiar}>Cancelar</button>}
            <button className="btn primary">{editandoId ? "Guardar cambios" : "Crear producto"}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Productos e ingredientes</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Zona</th>
              <th>Precio</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const muestraStock = p.controlaStock || p.tipo === TIPO_PRODUCTO.INGREDIENTE;
              const bajo = muestraStock && Number(p.stockActual) <= Number(p.stockMinimo);
              return (
                <tr key={p.id} style={{ opacity: p.activo === false ? 0.5 : 1 }}>
                  <td>{p.nombre}</td>
                  <td>{p.zona}</td>
                  <td>{colones(p.precio)}</td>
                  <td className={bajo ? "error" : ""}>{muestraStock ? p.stockActual : "—"}</td>
                  <td>
                    <button className="btn" onClick={() => editar(p)}>Editar</button>{" "}
                    <button className="btn" onClick={() => toggleActivo(p)}>
                      {p.activo === false ? "Activar" : "Desactivar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Salones y mesas</h2>
        <form onSubmit={crearSalon} className="pago-fila">
          <input placeholder="Nombre del salón (ej. Terraza)" value={nuevoSalon} onChange={(e) => setNuevoSalon(e.target.value)} />
          <button className="btn">+ Salón</button>
        </form>
        <form onSubmit={crearMesas} className="formulario" style={{ marginTop: 12 }}>
          <select value={salonElegido} onChange={(e) => setSalonElegido(e.target.value)}>
            <option value="">— salón —</option>
            {salones.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <input type="number" min="1" placeholder="Número inicial" value={inicioMesa} onChange={(e) => setInicioMesa(e.target.value)} />
          <input type="number" min="1" placeholder="Cantidad de mesas" value={cantMesas} onChange={(e) => setCantMesas(e.target.value)} />
          <button className="btn primary">Crear mesas</button>
        </form>
      </section>

      <section className="card">
        <h2>Observaciones de cocina</h2>
        <form onSubmit={agregarObs} className="pago-fila">
          <input placeholder="Ej. Término medio" value={nuevaObs} onChange={(e) => setNuevaObs(e.target.value)} />
          <button className="btn">+ Agregar</button>
        </form>
        <div className="chips" style={{ marginTop: 12 }}>
          {observaciones.map((o) => (
            <button key={o.id} className="chip" onClick={() => borrarObs(o.id)} title="Tocar para borrar">
              {o.texto} ×
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
