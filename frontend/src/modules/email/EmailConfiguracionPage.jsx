import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, CircleCheck, CircleX, MailCheck } from 'lucide-react'
import { email as emailApi } from '../../api/email.js'
import { Card, Btn, ErrorMsg, OkMsg } from '../../components/ui.jsx'

// Solo Gmail tiene proveedor real implementado hoy (GmailProvider vía
// OAuth). Outlook/IMAP quedan deshabilitados hasta implementarse — la
// arquitectura EmailProvider ya está lista para ambos.
const PROVEEDORES = [
  { key: 'gmail', nombre: 'Gmail', disponible: true },
  { key: 'outlook', nombre: 'Outlook / Microsoft 365', disponible: false },
  { key: 'imap', nombre: 'IMAP', disponible: false },
]

export default function EmailConfiguracionPage() {
  const [params, setParams] = useSearchParams()
  const [conexion, setConexion] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [desconectando, setDesconectando] = useState(false)

  useEffect(() => {
    if (params.get('email_conectado')) setOk('Cuenta de Gmail conectada correctamente.')
    if (params.get('email_error')) setError(params.get('email_error'))
    if (params.get('email_pendiente')) setPendiente(true)
    if (params.get('email_conectado') || params.get('email_error') || params.get('email_pendiente')) {
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    emailApi.estado().then((data) => setConexion(data.conexion)).catch((err) => setError(err.message))
  }, [ok])

  async function desconectar() {
    setDesconectando(true)
    setError('')
    try {
      await emailApi.desconectar()
      setConexion({ conectada: false, cuenta: null, proveedor: 'ninguno' })
      setOk('Cuenta desconectada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDesconectando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">
            Configuración de Email
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Conecta un proveedor de correo. Skynet nunca almacena tu contraseña: la conexión se hace por OAuth.
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {pendiente && (
        <div className="flex items-start gap-2 rounded-lg border border-cyan-600/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-800 dark:border-cyan-400/20 dark:text-cyan-300">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Te enviamos un correo a tu cuenta de Skynet describiendo este intento de conexión. Solo se conectará la
            cuenta de Gmail si apruebas el acceso desde ese correo (el enlace vence en 15 minutos).
          </p>
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Estado actual</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            {conexion?.conectada ? (
              <>
                <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-slate-700 dark:text-slate-300">Conectado como {conexion.cuenta}</span>
              </>
            ) : (
              <>
                <CircleX className="h-4 w-4 text-red-500" aria-hidden="true" />
                <span className="text-slate-700 dark:text-slate-300">Desconectado</span>
              </>
            )}
          </div>
          {conexion?.conectada && (
            <Btn variante="peligro" disabled={desconectando} onClick={desconectar}>
              {desconectando ? 'Desconectando…' : 'Desconectar'}
            </Btn>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Proveedor</h2>
        <div className="space-y-3">
          {PROVEEDORES.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">{p.nombre}</p>
              {p.disponible ? (
                <Btn
                  variante="secundario"
                  disabled={conexion?.conectada}
                  onClick={() => {
                    window.location.href = emailApi.urlConectarGmail()
                  }}
                >
                  {conexion?.conectada ? 'Ya conectado' : 'Conectar'}
                </Btn>
              ) : (
                <Btn variante="secundario" disabled title="Proveedor aún no implementado">
                  Conectar
                </Btn>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
