import React from 'react'
import claroImg from '../assets/claro.png'
import { cn } from '../lib/cn.js'

export const AVATAR_PREDETERMINADO = claroImg

/**
 * Componente AvatarUsuario
 * Renderiza la imagen de perfil oficial (frontend/src/assets/claro.png)
 * para todos los usuarios existentes o nuevos del sistema.
 */
export function AvatarUsuario({
  src,
  alt,
  className = 'h-8 w-8',
  usuario,
  borde = true,
  ...props
}) {
  const [errorCarga, setErrorCarga] = React.useState(false)
  const imageSrc = !errorCarga && (src || usuario?.foto || usuario?.avatar) ? (src || usuario?.foto || usuario?.avatar) : claroImg
  const altText = alt || usuario?.nombre || usuario?.nombre_usuario || 'Foto de perfil'

  return (
    <img
      src={imageSrc}
      alt={altText}
      onError={() => setErrorCarga(true)}
      className={cn(
        'shrink-0 rounded-full object-cover bg-white',
        borde && 'border border-slate-200/80 dark:border-white/10 shadow-2xs',
        className
      )}
      {...props}
    />
  )
}

export default AvatarUsuario
