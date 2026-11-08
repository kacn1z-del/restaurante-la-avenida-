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
