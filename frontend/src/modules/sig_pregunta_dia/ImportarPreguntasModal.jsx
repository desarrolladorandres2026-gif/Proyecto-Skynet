import { useRef, useState } from 'react'
import { Download, Upload, FileSpreadsheet, CircleCheck, TriangleAlert, CircleX } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { Btn, Card, ErrorMsg, Modal, TablaWrap, Th, Td } from '../../components/ui.jsx'

// Guía que se muestra ANTES de elegir el archivo: los mismos títulos y la
// misma obligatoriedad que produce la plantilla descargable
// (generarPlantillaExcel en Backend/.../sig-importacion.service.js). Si allá
// se agrega o renombra una columna, hay que reflejarlo aquí.
//
// Un desfase desinforma pero NO rompe la importación: el backend mapea los
// encabezados por alias normalizados (sin tildes ni mayúsculas), nunca por
// posición ni por el título exacto.
const COLUMNAS_PLANTILLA = [
  {
    titulo: 'Enunciado',
    obligatoria: true,
    ayuda: 'La pregunta completa. No la numeres: el trabajador la ve sola en pantalla.',
    ejemplo: '¿Cuál es el elemento de protección obligatorio para trabajo en alturas?',
  },
  {
    titulo: 'Componente SIG',
    obligatoria: true,
    ayuda: 'Uno de los componentes configurados (ver abajo). Se compara sin tildes ni mayúsculas.',
    ejemplo: 'SST',
  },
  {
    titulo: 'Tema',
    obligatoria: true,
    ayuda: 'Agrupa el banco y es lo que usan los planes de refuerzo: repite el mismo tema en preguntas del mismo asunto.',
    ejemplo: 'Trabajo en alturas',
  },
  {
    titulo: 'Opción A, B, C y D',
    obligatoria: true,
    ayuda: 'Las 4 alternativas, una por columna. Siempre son 4 y solo una puede ser la correcta.',
    ejemplo: 'Arnés de cuerpo completo',
  },
  {
    titulo: 'Respuesta correcta',
    obligatoria: true,
    ayuda: 'La letra de la opción correcta. También se acepta el número (1 a 4) o el texto exacto de la opción.',
    ejemplo: 'A',
  },
  {
    titulo: 'Retroalimentación correcta e incorrecta',
    obligatoria: false,
    ayuda: 'Lo que lee el trabajador al responder. Recomendadas: es donde de verdad queda el mensaje que se quiere reforzar.',
    ejemplo: 'Por encima de 1,50 m el arnés de cuerpo completo es obligatorio.',
  },
  {
    titulo: 'Etiquetas',
    obligatoria: false,
    ayuda: 'Palabras clave separadas por coma; sirven para filtrar el banco después.',
    ejemplo: 'alturas, epp',
  },
]

// Carga masiva del banco desde un .xlsx ya redactado.
//
// El modal tiene dos estados y no se cierra solo al terminar: primero se elige
// el archivo, y después se queda mostrando el RESULTADO fila por fila. Cerrar
// automáticamente con un toast de "listo" escondería justo lo que el
// administrador necesita ver — cuáles filas no entraron y por qué —, porque la
// importación es parcial por diseño (ver sig-importacion.service.js).
export default function ImportarPreguntasModal({ abierto, onCerrar, onImportado, componentes = [] }) {
  const inputRef = useRef(null)
  const [archivo, setArchivo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  function reiniciar() {
    setArchivo(null)
    setResultado(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function cerrar() {
    reiniciar()
    onCerrar()
  }

  async function descargarPlantilla() {
    setDescargando(true)
    setError('')
    try {
      const { blob, nombre } = await sig.banco.descargarPlantilla()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDescargando(false)
    }
  }

  async function importar() {
    if (!archivo) return
    setSubiendo(true)
    setError('')
    try {
      const datos = await sig.banco.importar(archivo)
      setResultado(datos)
      if (datos.importadas > 0) {
        toast.success(`${datos.importadas} pregunta${datos.importadas === 1 ? '' : 's'} importada${datos.importadas === 1 ? '' : 's'}`)
        onImportado()
      } else {
        toast.warning('No se importó ninguna pregunta; revisa el detalle')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo="Importar preguntas desde Excel" onCerrar={cerrar} ancho="max-w-2xl">
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>

        {!resultado ? (
          <>
            <Card className="!bg-cyan-500/5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Descarga el formato, llénalo y sube ese mismo archivo aquí
              </p>
              <ol className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                <li>
                  <strong>1.</strong> Descarga la plantilla: ya trae los encabezados, una pregunta de ejemplo y una
                  hoja de instrucciones.
                </li>
                <li>
                  <strong>2.</strong> Escribe <strong>una pregunta por fila</strong>, sin borrar ni cambiar la fila de
                  encabezados.
                </li>
                <li>
                  <strong>3.</strong> Súbela abajo. Las filas con error se omiten y se te reportan una por una; las
                  demás sí entran al banco.
                </li>
              </ol>
              <Btn
                variante="secundario"
                className="mt-3 flex items-center gap-1.5"
                disabled={descargando}
                onClick={descargarPlantilla}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {descargando ? 'Preparando…' : 'Descargar plantilla'}
              </Btn>
            </Card>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Qué debe llevar cada pregunta
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {COLUMNAS_PLANTILLA.map((columna) => (
                  <li
                    key={columna.titulo}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{columna.titulo}</span>
                      <span
                        className={
                          columna.obligatoria
                            ? 'panel-mono rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-red-700 uppercase dark:text-red-300'
                            : 'panel-mono rounded-full bg-slate-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-600 uppercase dark:text-slate-300'
                        }
                      >
                        {columna.obligatoria ? 'Obligatoria' : 'Opcional'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{columna.ayuda}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Ej.: {columna.ejemplo}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Un componente que no coincide con el catálogo configurado es el
                motivo de rechazo más común: se listan los válidos aquí mismo
                para poder copiarlos tal cual al Excel. */}
            {componentes.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Componentes SIG válidos hoy — escribe uno de estos en la columna «Componente SIG»:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {componentes.map((componente) => (
                    <span
                      key={componente}
                      className="panel-mono rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-800 dark:text-cyan-300"
                    >
                      {componente}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <input
                ref={inputRef}
                id="sig-archivo-preguntas"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] || null)
                  setError('')
                }}
              />
              <label
                htmlFor="sig-archivo-preguntas"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center transition-colors hover:border-cyan-500/60 hover:bg-cyan-500/5 dark:border-slate-600"
              >
                <FileSpreadsheet className="h-8 w-8 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                {archivo ? (
                  <>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{archivo.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {(archivo.size / 1024).toFixed(0)} KB · Toca para cambiar el archivo
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Selecciona el archivo de Excel
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Formato .xlsx, hasta 5 MB</span>
                  </>
                )}
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Btn variante="secundario" onClick={cerrar}>Cancelar</Btn>
              <button
                type="button"
                disabled={!archivo || subiendo}
                onClick={importar}
                className="panel-btn-primario flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {subiendo ? 'Importando…' : 'Importar preguntas'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Card>
                <CircleCheck className="mx-auto mb-1 h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resultado.importadas}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Importadas</p>
              </Card>
              <Card>
                <TriangleAlert className="mx-auto mb-1 h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{resultado.duplicadas.length}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Ya existían</p>
              </Card>
              <Card>
                <CircleX className="mx-auto mb-1 h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{resultado.errores.length}</p>
                <p className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Con error</p>
              </Card>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Se leyeron {resultado.filasLeidas} filas del archivo.
            </p>

            {resultado.errores.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Filas que no se importaron
                </p>
                <div className="max-h-56 overflow-y-auto">
                  <TablaWrap>
                    <thead>
                      <tr>
                        <Th>Fila</Th>
                        <Th>Pregunta</Th>
                        <Th>Motivo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.errores.map((e) => (
                        <tr key={`error-${e.fila}`}>
                          <Td className="whitespace-nowrap">{e.fila}</Td>
                          <Td className="max-w-xs">{e.enunciado || '—'}</Td>
                          <Td className="max-w-sm text-red-600 dark:text-red-400">{e.mensaje}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TablaWrap>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Corrige esas filas en el archivo y vuelve a subirlo: las que ya entraron se detectarán como
                  duplicadas y no se repetirán.
                </p>
              </div>
            )}

            {resultado.duplicadas.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Omitidas por estar ya en el banco
                </p>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-slate-600 dark:text-slate-300">
                  {resultado.duplicadas.map((d) => (
                    <li key={`dup-${d.fila}`}>
                      <span className="panel-mono text-xs text-slate-400">Fila {d.fila}:</span> {d.enunciado}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variante="secundario" onClick={reiniciar}>Importar otro archivo</Btn>
              <Btn onClick={cerrar}>Listo</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
