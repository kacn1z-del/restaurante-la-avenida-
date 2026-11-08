export function colones(valor) {
  return "₡" + Math.round(Number(valor) || 0).toLocaleString("es-CR");
}

export function horaCorta(fecha) {
  return fecha instanceof Date
    ? fecha.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })
    : "";
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

// Convierte un teléfono costarricense (8 dígitos) al formato internacional de WhatsApp
export function telefonoWhatsapp(telefono) {
  const solo = String(telefono || "").replace(/\D/g, "");
  if (!solo) return "";
  return solo.length === 8 ? "506" + solo : solo;
}

// Enlace que abre WhatsApp con el mensaje ya escrito
export function enlaceWhatsapp(telefono, texto) {
  const numero = telefonoWhatsapp(telefono);
  const query = "text=" + encodeURIComponent(texto);
  return numero ? `https://wa.me/${numero}?${query}` : `https://wa.me/?${query}`;
}

// Enlace mailto que abre el correo con asunto y cuerpo listos
export function enlaceCorreo(asunto, cuerpo, para = "") {
  return `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

// Convierte columnas y filas en texto plano para pegar en un correo
export function tablaTexto(columnas, filas) {
  const lineas = [columnas.join(" | ")];
  for (const fila of filas) lineas.push(fila.map((c) => String(c)).join(" | "));
  return lineas.join("\n");
}
