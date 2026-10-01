// ¿Puede abrir `base` alguien que NO está en esta máquina? localhost y las IPs
// privadas resuelven a la máquina (o la red) de quien abre el enlace, no a
// este servidor. Lo usan las plantillas de correo, para no incrustar enlaces
// rotos, y config/workers.js, para reconocer un backend de desarrollo.
export function esUrlPublica(base) {
  if (typeof base !== 'string') return false
  try {
    const { protocol, hostname } = new URL(base)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return false
    // IPs privadas (10.x, 192.168.x, 172.16-31.x): tampoco resuelven fuera
    // de la red local de quien envía.
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
    return hostname.includes('.')
  } catch {
    return false
  }
}
