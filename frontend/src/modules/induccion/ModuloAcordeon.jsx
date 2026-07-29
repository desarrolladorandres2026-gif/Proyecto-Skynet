import { useState } from 'react'
import { ChevronDown, ChevronRight, Volume2, Square, PartyPopper } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { AGENTE_IA, obtenerQuiz } from './induccionData.js'
import { marcarCompletado, setPuntaje } from './induccionProgress.js'
import { useNarracionVoz } from './useNarracionVoz.js'
import './induccion.css'

// Un módulo completo (contenido + quiz) como sección plegable dentro de un
// único recuadro de inducción — reemplaza las antiguas páginas separadas
// ModuloPage/QuizPage para que los 6 módulos vivan en un solo lugar.
export default function ModuloAcordeon({ modulo, expandido, completado, puntajeGuardado, onToggle, onCompletado, onSiguiente, esUltimo }) {
  const { usuario } = useAuth()
  const quiz = obtenerQuiz(modulo.id)
  const { reproduciendo, iniciar, detener, soportado } = useNarracionVoz()

  // Si el módulo ya tenía puntaje guardado (de una sesión anterior), abrir
  // directamente en el estado "resultado" en vez de un quiz en blanco —
  // evita que reabrir un módulo completado tras recargar la página luzca
  // inconsistente con el badge "Completado" de su encabezado.
  const puntajeInicial = puntajeGuardado ? parseInt(puntajeGuardado.split('/')[0], 10) : null
  const [respuestas, setRespuestas] = useState({})
  const [resultado, setResultado] = useState(puntajeInicial)

  const todasRespondidas = quiz.preguntas.every((p) => respuestas[p.id])

  function elegir(preguntaId, valor) {
    setRespuestas((prev) => ({ ...prev, [preguntaId]: valor }))
  }

  function enviarQuiz(e) {
    e.preventDefault()
    let correctas = 0
    for (const p of quiz.preguntas) {
      if (respuestas[p.id] === p.correcta) correctas++
    }
    marcarCompletado(usuario?.id_usuario, modulo.id)
    setPuntaje(usuario?.id_usuario, modulo.id, correctas, quiz.preguntas.length)
    setResultado(correctas)
    onCompletado(modulo.id)
  }

  return (
    <div className="ind-acordeon-item">
      <button
        type="button"
        onClick={onToggle}
        className="ind-acordeon-header flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <modulo.icono className="h-6 w-6 shrink-0 text-cyan-700/80 dark:text-cyan-400/80" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="panel-mono text-[11px] uppercase tracking-wide text-slate-500">Módulo {modulo.id}</p>
          <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{modulo.titulo}</p>
        </div>
        {completado && (
          <span className="panel-mono shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-400/30 dark:text-emerald-300">
            Completado{puntajeGuardado ? ` · ${puntajeGuardado}` : ''}
          </span>
        )}
        {expandido ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-cyan-700/70 dark:text-cyan-400/70" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-cyan-700/70 dark:text-cyan-400/70" aria-hidden="true" />
        )}
      </button>

      {expandido && (
        <div className="border-t border-cyan-600/15 px-4 py-5 dark:border-cyan-400/10">
          {soportado && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => (reproduciendo ? detener() : iniciar(modulo.narracion))}
                className="panel-btn-secundario flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              >
                <img src={AGENTE_IA} alt="" className="h-5 w-5 rounded-full" aria-hidden />
                {reproduciendo ? (
                  <Square className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                )}
                {reproduciendo ? 'Detener narración' : 'Reproducir narración'}
              </button>
            </div>
          )}

          {modulo.video && (
            <div className="ind-video-wrap mb-5">
              <video controls playsInline className="w-full rounded-lg" style={{ maxHeight: '55vh' }}>
                <source src={modulo.video.src} type="video/mp4" />
                Tu navegador no soporta la reproducción de video.
              </video>
            </div>
          )}

          <div className="space-y-4">
            {modulo.secciones.map((s) => (
              <div key={s.id} className="ind-seccion">
                <h3 className="mb-2 text-base font-semibold text-cyan-700 dark:text-cyan-300">{s.titulo}</h3>
                <div className="ind-content" dangerouslySetInnerHTML={{ __html: s.html }} />
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-cyan-600/15 pt-5 dark:border-cyan-400/10">
            {resultado === null ? (
              <form onSubmit={enviarQuiz} className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{quiz.titulo}</h3>
                {quiz.preguntas.map((p, i) => (
                  <div key={p.id} className="ind-pregunta rounded-lg p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{i + 1}. {p.texto}</p>
                      <button
                        type="button"
                        title="Escuchar pregunta"
                        onClick={() => iniciar([p.texto])}
                        className="panel-btn-fantasma shrink-0 rounded-lg px-2 py-1 text-sm"
                      >
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {p.opciones.map((op) => {
                        const activa = respuestas[p.id] === op.valor
                        return (
                          <label
                            key={op.valor}
                            className={`block cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition ${
                              activa
                                ? 'border-cyan-600/50 bg-cyan-600/10 text-cyan-800 dark:border-cyan-400/50 dark:bg-cyan-400/10 dark:text-cyan-200'
                                : 'border-slate-900/10 bg-slate-900/[0.02] text-slate-600 hover:border-cyan-600/25 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-400/25'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`${modulo.id}-${p.id}`}
                              value={op.valor}
                              checked={activa}
                              onChange={() => elegir(p.id, op.valor)}
                              className="mr-2 accent-cyan-400"
                            />
                            {op.valor}. {op.texto}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex justify-center pt-1">
                  <button
                    type="submit"
                    disabled={!todasRespondidas}
                    className="panel-btn-primario rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Finalizar módulo {modulo.id}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-200">
                  <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Completaste el módulo {modulo.id}. Tu puntaje: <strong>{resultado}/{quiz.preguntas.length}</strong>
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSiguiente(modulo.id)}
                    className="panel-btn-primario rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    {esUltimo ? 'Ir al certificado →' : 'Siguiente módulo →'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRespuestas({})
                      setResultado(null)
                    }}
                    className="panel-btn-fantasma rounded-lg px-3 py-2 text-sm"
                  >
                    Volver a responder el quiz
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
