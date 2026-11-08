export function colones(valor) {
  return "₡" + Math.round(Number(valor) || 0).toLocaleString("es-CR");
}

export function horaCorta(ts) {
  const fecha = ts?.toDate ? ts.toDate() : null;
  return fecha ? fecha.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }) : "";
}

export function inicioDelDia() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function nuevoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
