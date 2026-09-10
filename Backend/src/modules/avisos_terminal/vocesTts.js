// Catálogo de voces institucionales disponibles para "Avisos Terminal de
// Neiva". Son nombres de voz prediseñadas del modelo de voz de Gemini
// (gemini-2.5-flash-preview-tts) — no cualquier nombre documentado por
// Google sirve: esta lista se limita a las que se probaron de verdad contra
// la API real con la GEMINI_API_KEY de este proyecto (ver auditoría de
// implementación). Agregar una nueva exige probarla primero: un nombre
// inválido no falla al guardar el catálogo, falla en caliente al transmitir
// el primer aviso con esa voz.
export const VOCES_TTS = [
  { id: 'Kore', nombre: 'Kore', descripcion: 'Firme y clara' },
  { id: 'Puck', nombre: 'Puck', descripcion: 'Animada' },
  { id: 'Charon', nombre: 'Charon', descripcion: 'Formal, informativa' },
  { id: 'Orus', nombre: 'Orus', descripcion: 'Firme, grave' },
  { id: 'Umbriel', nombre: 'Umbriel', descripcion: 'Relajada' },
]

export const VOZ_TTS_DEFECTO = VOCES_TTS[0].id

export function esVozTtsValida(id) {
  return VOCES_TTS.some((v) => v.id === id)
}
