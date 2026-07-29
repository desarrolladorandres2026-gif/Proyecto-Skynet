// Fuente única de los umbrales de SLA por defecto (Fase 1 del CMMS de
// Mantenimiento). sincronizarConfiguracionSLA() los usa solo para crear las
// filas que falten en ConfiguracionSLA; un ajuste posterior hecho por un
// administrador nunca se sobrescribe.
export const SLA_MANTENIMIENTO = [
  { prioridad: 'critica', horas_respuesta: 1, horas_solucion: 4 },
  { prioridad: 'alta', horas_respuesta: 2, horas_solucion: 8 },
  { prioridad: 'media', horas_respuesta: 4, horas_solucion: 24 },
  { prioridad: 'baja', horas_respuesta: 8, horas_solucion: 72 },
]
