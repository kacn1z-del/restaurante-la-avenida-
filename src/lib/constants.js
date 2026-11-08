export const ESTADO_MESA = {
  LIBRE: "libre",
  OCUPADA: "ocupada",
  RESERVADA: "reservada",
  OTRO_TERMINAL: "otro_terminal",
};

export const ESTADO_PEDIDO = {
  ABIERTO: "abierto",
  EN_COCINA: "en_cocina",
  LISTO: "listo",
  COBRADO: "cobrado",
  ANULADO: "anulado",
};

export const ZONA = {
  BARRA: "barra",
  COCINA: "cocina",
};

export const TIPO_PRODUCTO = {
  VENTA: "venta",
  INGREDIENTE: "ingrediente",
  AMBOS: "ambos",
};

export const ROL = {
  ADMIN: "admin",
  MESERO: "mesero",
  COCINA: "cocina",
  BARRA: "barra",
  CAJA: "caja",
};

export const METODOS_PAGO = [
  { id: "efectivo", label: "Efectivo" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "sinpe", label: "SINPE Móvil" },
];

// Denominaciones de colones usadas en el conteo de cierre de caja
export const DENOMINACIONES_CRC = [50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5];

// Tarifa de impuesto Hacienda CR (código 08 = general 13%)
export const TARIFA_IVA = { codigo: "08", porcentaje: 13 };

// Orden de servicio que se elige por producto en la comanda
export const OPCIONES_ORDEN_SERVICIO = ["Primero", "Segundo", "Tercero", "Para compartir", "Sin orden"];

// Tarifas de impuesto Hacienda CR (se verifican con el catálogo antes de facturar)
export const TARIFAS_IMPUESTO = [
  { codigo: "08", label: "08 - Tarifa general 13%" },
  { codigo: "04", label: "04 - Tarifa reducida 4%" },
  { codigo: "02", label: "02 - Tarifa reducida 1%" },
  { codigo: "01", label: "01 - Tarifa 0% (exento)" },
];

// Colores para identificar cada producto en el menú
export const COLORES_PRODUCTO = [
  "#e8792b", "#4f9d69", "#4f6fd9", "#c92f1c",
  "#f2a53a", "#8f7c68", "#7a5bd6", "#2aa3a3",
];

// Denominaciones por moneda para el conteo de caja
export const DENOMINACIONES = {
  CRC: [50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5],
  USD: [100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
  EUR: [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
};

export const MONEDAS = [
  { id: "CRC", label: "Colones (₡)" },
  { id: "USD", label: "Dólares (US$)" },
  { id: "EUR", label: "Euros (€)" },
];
