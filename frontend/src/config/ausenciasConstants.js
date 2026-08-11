// Espejo en cliente de los enums de Backend/src/models/Ausencia.js
// (TIPOS_AUSENCIA, MOTIVOS_PERMISO_REMUNERADO): centralizado aquí porque lo
// usan tanto el formulario de solicitud (MisAusenciasPage) como la bandeja
// de decisión (BandejaAusenciasPage), y duplicar la lista en los dos
// arriesgaba que se desincronizaran las etiquetas.
export const TIPOS_AUSENCIA = [
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'permiso_remunerado', label: 'Permiso remunerado' },
  { value: 'permiso_no_remunerado', label: 'Permiso no remunerado' },
  { value: 'incapacidad', label: 'Incapacidad' },
]

export const TIPO_AUSENCIA_LABELS = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.value, t.label]))

// Causales que el CST (art. 57, mod. Ley 2466 de 2025) obliga a remunerar —
// 'otro' cubre lo que el Terminal decide pagar aunque la ley no lo exija.
export const MOTIVOS_PERMISO_REMUNERADO = [
  { value: 'luto', label: 'Luto (familiar cercano)' },
  { value: 'calamidad_domestica', label: 'Calamidad doméstica' },
  { value: 'cita_medica', label: 'Cita médica propia' },
  { value: 'citacion_autoridad', label: 'Citación de autoridad judicial o administrativa' },
  { value: 'sufragio', label: 'Ejercer el derecho al voto' },
  { value: 'jurado_votacion', label: 'Jurado de votación' },
  { value: 'obligacion_escolar', label: 'Obligación escolar (acudiente)' },
  { value: 'sindical', label: 'Actividad sindical' },
  { value: 'otro', label: 'Otro autorizado por el Terminal' },
]

export const MOTIVO_LICENCIA_LABELS = Object.fromEntries(MOTIVOS_PERMISO_REMUNERADO.map((m) => [m.value, m.label]))
