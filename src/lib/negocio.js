import { useEffect, useState } from "react";
import { leerDoc } from "./api.js";

// Datos generales del negocio, guardados en configuracion/negocio
export const NEGOCIO_VACIO = {
  nombre: "Restaurante La Avenida",
  direccion: "",
  cedulaJuridica: "",
  telefono: "",
  leyenda: "¡Gracias por su visita!",
};

export function useNegocio() {
  const [negocio, setNegocio] = useState(NEGOCIO_VACIO);

  useEffect(() => {
    let vivo = true;
    leerDoc("configuracion", "negocio")
      .then((datos) => {
        if (vivo && datos) setNegocio({ ...NEGOCIO_VACIO, ...datos });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  return negocio;
}
