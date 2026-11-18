# Genera la narración (un WAV por escena) a partir de guion.json con la voz
# en español de Windows. Todo local: ningún texto sale del equipo.
#
# Para cambiar de voz: ejecutar con -Voz "Nombre de la voz" (ver las instaladas
# con -Listar). Si algún día se prefiere una voz neuronal, basta con dejar los
# WAV en narracion/NN-id.wav: render.mjs solo lee esos archivos.
param(
  [string]$Voz = 'Microsoft Helena Desktop',
  [int]$Velocidad = -1,
  [switch]$Listar
)

Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Listar) { $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + ' (' + $_.VoiceInfo.Culture + ')' }; return }

$s.SelectVoice($Voz)
$s.Rate = $Velocidad
$s.Volume = 100

$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$guion = Get-Content -Raw -Encoding UTF8 (Join-Path $aqui 'guion.json') | ConvertFrom-Json
$carpeta = Join-Path $aqui 'narracion'
New-Item -ItemType Directory -Force $carpeta | Out-Null

$n = 0
foreach ($escena in $guion) {
  $n++
  $archivo = Join-Path $carpeta ('{0:D2}-{1}.wav' -f $n, $escena.id)
  $s.SetOutputToWaveFile($archivo)
  $s.Speak($escena.texto)
  $s.SetOutputToNull()
  Write-Host ('{0:D2} {1}' -f $n, $escena.id)
}
$s.Dispose()
Write-Host "Listo: $n archivos en $carpeta"
