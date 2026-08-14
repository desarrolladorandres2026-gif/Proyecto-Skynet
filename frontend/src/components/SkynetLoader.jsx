import React from 'react'

/**
 * Componente de carga Skynet optimizado para dispositivos móviles y de escritorio.
 * Presenta una interfaz HUD táctica con la paleta cyber del login (#00e5ff, #05070a, #34d399).
 */
export default function SkynetLoader({
  mensaje = 'CARGANDO...',
  subtexto = 'VERIFICANDO CREDENCIALES Y SERVICIOS',
  tamano = 'md',
  pantallaCompleta = true,
  className = '',
}) {
  const tamanoOrb = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  }[tamano] || 'w-16 h-16'

  const tamanoCore = {
    sm: 'w-8 h-8 text-sm rounded-lg',
    md: 'w-10 h-10 text-base rounded-xl',
    lg: 'w-14 h-14 text-xl rounded-2xl',
  }[tamano] || 'w-10 h-10 text-base rounded-xl'

  if (pantallaCompleta) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-[#05070a]/90 backdrop-blur-md p-4 select-none transform-gpu ${className}`}
        style={{ willChange: 'transform, opacity' }}
        role="status"
        aria-label={mensaje}
      >
        <div className="relative flex flex-col items-center justify-center w-full max-w-sm p-6 sm:p-8 rounded-md border border-[#00e5ff]/20 bg-[#0a0e16]/95 shadow-2xl shadow-black/80 ring-1 ring-[#00e5ff]/15">
          {/* Brackets HUD estilo Login */}
          <span className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-[#00e5ff]/70 pointer-events-none" />
          <span className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t-2 border-r-2 border-[#00e5ff]/70 pointer-events-none" />
          <span className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b-2 border-l-2 border-[#00e5ff]/70 pointer-events-none" />
          <span className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-[#00e5ff]/70 pointer-events-none" />

          {/* Orbe Holográfico */}
          <div className={`relative ${tamanoOrb} flex items-center justify-center mb-4 transform-gpu`}>
            <div className="absolute -inset-2 rounded-full bg-[#00e5ff]/20 blur-md animate-pulse transform-gpu" />
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00e5ff] border-r-[#34d399] animate-spin transform-gpu"
              style={{ animationDuration: '1.4s' }}
            />
            <div
              className="absolute inset-1.5 rounded-full border border-dashed border-[#00e5ff]/60 animate-spin transform-gpu"
              style={{ animationDirection: 'reverse', animationDuration: '3.2s' }}
            />
            <div
              className={`${tamanoCore} bg-[#080c14] border border-[#00e5ff]/50 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.35)]`}
            >
              <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#bff9ff] to-[#00e5ff]">
                S
              </span>
            </div>
          </div>

          <h3
            className="text-sm font-bold tracking-[0.28em] text-white uppercase text-center font-mono"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.4)' }}
          >
            {mensaje}
          </h3>

          {subtexto && (
            <p className="text-[11px] text-[#00e5ff]/80 font-mono tracking-wider mt-1.5 text-center opacity-90 animate-pulse">
              {subtexto}
            </p>
          )}

          {/* Barra de progreso de escaneo */}
          <div className="w-36 h-1 bg-[#00e5ff]/15 rounded-full overflow-hidden mt-4 relative">
            <div
              className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent rounded-full animate-[skynetGpuBar_1.4s_cubic-bezier(0.4,0,0.2,1)_infinite] transform-gpu"
              style={{ boxShadow: '0 0 8px #00e5ff' }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 w-full select-none transform-gpu ${className}`}
      style={{ willChange: 'transform, opacity' }}
      role="status"
      aria-label={mensaje}
    >
      <div className={`relative ${tamanoOrb} flex items-center justify-center mb-3 transform-gpu`}>
        <div className="absolute -inset-1 rounded-full bg-[#00e5ff]/20 blur-sm animate-pulse transform-gpu" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00e5ff] border-r-[#34d399] animate-spin transform-gpu"
          style={{ animationDuration: '1.2s' }}
        />
        <div
          className={`${tamanoCore} bg-[#080c14] border border-[#00e5ff]/50 flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.3)]`}
        >
          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-[#bff9ff] to-[#00e5ff]">
            S
          </span>
        </div>
      </div>

      {mensaje && (
        <p
          className="text-xs font-semibold tracking-[0.2em] text-[#00e5ff] uppercase text-center animate-pulse font-mono"
          style={{ textShadow: '0 0 8px rgba(0, 229, 255, 0.4)' }}
        >
          {mensaje}
        </p>
      )}

      {subtexto && (
        <p className="text-[11px] text-slate-400 font-mono tracking-wider mt-1 text-center">
          {subtexto}
        </p>
      )}
    </div>
  )
}
