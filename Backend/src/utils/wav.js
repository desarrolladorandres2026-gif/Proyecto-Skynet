// Envuelve PCM crudo (lo que devuelve la API de voz de Gemini: 16-bit signed
// little-endian, mono, 24 kHz — mimeType "audio/L16;codec=pcm;rate=24000") en
// un contenedor WAV reproducible. Los navegadores no pueden reproducir PCM
// crudo directamente con <audio>/new Audio(): necesitan un contenedor con
// cabecera que declare formato, canales y frecuencia de muestreo — WAV es el
// más simple posible para eso (44 bytes de cabecera, sin compresión).
export function pcm16ToWav(pcmBuffer, { sampleRate = 24000, numChannels = 1 } = {}) {
  const bitsPorMuestra = 16
  const byteRate = sampleRate * numChannels * (bitsPorMuestra / 8)
  const blockAlign = numChannels * (bitsPorMuestra / 8)
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmBuffer.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // tamaño del sub-bloque fmt
  header.writeUInt16LE(1, 20) // PCM sin comprimir
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPorMuestra, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmBuffer.length, 40)

  return Buffer.concat([header, pcmBuffer])
}
