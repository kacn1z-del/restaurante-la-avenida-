import { useEffect, useState } from "react";
import { auth } from "../firebase.js";
import { nuevoId } from "./format.js";

const PROYECTO = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)`;
const RAIZ = `projects/${PROYECTO}/databases/(default)/documents`;

const MARCA_AHORA = "ahora";
const MARCA_INCREMENTO = "incremento";

const OPERADORES = { "==": "EQUAL", in: "IN", ">=": "GREATER_THAN_OR_EQUAL" };

// ---------- Peticiones HTTP ----------

async function peticion(ruta, { method = "GET", body } = {}) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("No hay sesión activa");
  const token = await usuario.getIdToken();
  const separador = ruta.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${ruta}${separador}key=${API_KEY}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  const json = texto ? JSON.parse(texto) : {};
  if (!res.ok) {
    const error = new Error(json.error?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = json.error?.status || "";
    throw error;
  }
  return json;
}

// ---------- Conversión JS <-> Firestore ----------

function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === "object") return { mapValue: { fields: aCampos(v) } };
  return { stringValue: String(v) };
}

function aCampos(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, aValor(v)])
  );
}

function deValor(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return deCampos(v.mapValue.fields || {});
  return null;
}

function deCampos(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, deValor(v)]));
}

function deDoc(doc) {
  const datos = { id: doc.name.split("/").pop(), ...deCampos(doc.fields || {}) };
  // Versión del documento para detectar cambios concurrentes.
  // No es enumerable, así que no se copia al hacer spread.
  Object.defineProperty(datos, "_version", { value: doc.updateTime, enumerable: false });
  return datos;
}

// ---------- Lecturas ----------

export async function leerDoc(coleccion, id) {
  try {
    const doc = await peticion(`/documents/${coleccion}/${encodeURIComponent(id)}`);
    return deDoc(doc);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function consultar(coleccion, { where = [], orden = [], limite } = {}) {
  const consulta = { from: [{ collectionId: coleccion }] };

  const filtros = where.map(([campo, op, valor]) => ({
    fieldFilter: {
      field: { fieldPath: campo },
      op: OPERADORES[op],
      value: aValor(valor),
    },
  }));
  if (filtros.length === 1) consulta.where = filtros[0];
  if (filtros.length > 1) consulta.where = { compositeFilter: { op: "AND", filters: filtros } };

  if (orden.length) {
    consulta.orderBy = orden.map(([campo, dir = "asc"]) => ({
      field: { fieldPath: campo },
      direction: dir === "desc" ? "DESCENDING" : "ASCENDING",
    }));
  }
  if (limite) consulta.limit = limite;

  const res = await peticion("/documents:runQuery", {
    method: "POST",
    body: { structuredQuery: consulta },
  });
  return res.filter((r) => r.document).map((r) => deDoc(r.document));
}

// ---------- Escrituras ----------

export const ahora = () => ({ __marca: MARCA_AHORA });
export const incremento = (n) => ({ __marca: MARCA_INCREMENTO, n });
export const nuevoIdDoc = () => nuevoId();

function construir(coleccion, id, datos, { mascara = false, existe, version } = {}) {
  const campos = {};
  const transformaciones = [];

  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined) continue;
    if (v?.__marca === MARCA_AHORA) {
      transformaciones.push({ fieldPath: k, setToServerValue: "REQUEST_TIME" });
    } else if (v?.__marca === MARCA_INCREMENTO) {
      transformaciones.push({ fieldPath: k, increment: aValor(v.n) });
    } else {
      campos[k] = v;
    }
  }

  const escritura = {
    update: { name: `${RAIZ}/${coleccion}/${id}`, fields: aCampos(campos) },
  };
  // Con máscara solo se tocan los campos listados; sin máscara se reemplaza el documento completo
  if (mascara) escritura.updateMask = { fieldPaths: Object.keys(campos) };
  if (transformaciones.length) escritura.updateTransforms = transformaciones;
  if (version) escritura.currentDocument = { updateTime: version };
  else if (existe !== undefined) escritura.currentDocument = { exists: existe };
  return escritura;
}

// Crea un documento nuevo; falla si ya existe
export function crear(coleccion, id, datos) {
  return construir(coleccion, id, datos, { existe: false });
}

// Actualiza solo los campos indicados; falla si el documento no existe.
// Con { version } falla si alguien lo cambió desde que se leyó.
export function actualizar(coleccion, id, datos, { version } = {}) {
  return construir(coleccion, id, datos, { mascara: true, existe: true, version });
}

export function borrar(coleccion, id) {
  return { delete: `${RAIZ}/${coleccion}/${id}` };
}

// Todas las escrituras de la lista se aplican juntas, como un batch
export async function confirmar(escrituras) {
  if (!escrituras.length) return;
  await peticion("/documents:commit", { method: "POST", body: { writes: escrituras } });
}

// ---------- Actualización periódica (reemplaza onSnapshot) ----------

export function usePolling(traer, deps, ms = 4000) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;

    async function correr() {
      try {
        const resultado = await traer();
        if (vivo) {
          setDatos(resultado);
          setError("");
        }
      } catch (e) {
        if (vivo) setError(e.message);
      }
    }

    correr();
    const intervalo = setInterval(correr, ms);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { datos, error, recargar: () => setVersion((v) => v + 1) };
}
