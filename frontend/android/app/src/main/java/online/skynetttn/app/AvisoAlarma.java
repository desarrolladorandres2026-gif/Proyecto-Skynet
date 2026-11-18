package online.skynetttn.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.media.Ringtone;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.CookieManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Reproduce un Aviso Terminal de Neiva como una alerta de emergencia (estilo
 * alerta Amber): suena AUNQUE el teléfono esté bloqueado, en silencio o en
 * "No molestar", porque usa el canal de audio de ALARMA (USAGE_ALARM) en vez
 * del de notificaciones/multimedia, que es el que el modo silencio recorta.
 *
 * Secuencia: vibración + campanita -> voz institucional (WAV generado por el
 * backend) o, si no hay audio, voz local del teléfono (TextToSpeech).
 *
 * Bloquea el hilo que lo llama hasta terminar: se invoca siempre desde el
 * ejecutor de avisos de NotifService (nunca desde el hilo del SSE).
 */
final class AvisoAlarma {

    private static final long MAX_ESPERA_VOZ_MS = 60_000;

    private AvisoAlarma() {}

    private static final AudioAttributes ATRIBUTOS_ALARMA = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();

    /** @return true si la locución se reprodujo completa (para confirmar "reproducido"). */
    static boolean reproducir(Context ctx, String base, String audioUrl, String textoLocucion) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = null;
        AudioFocusRequest foco = null;
        int volumenOriginal = -1;
        int volumenMaximo = 0;

        try {
            // CPU despierta durante la locución: sin esto, con la pantalla
            // apagada Android puede dormir el proceso a mitad de la voz.
            if (pm != null) {
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "skynet:aviso");
                wl.acquire(MAX_ESPERA_VOZ_MS + 15_000);
            }

            if (am != null) {
                // Volumen de alarma al máximo mientras dura el aviso (se
                // restaura al final). La alerta debe oírse aunque la persona
                // tuviera la alarma casi muda.
                try {
                    volumenMaximo = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                    volumenOriginal = am.getStreamVolume(AudioManager.STREAM_ALARM);
                    am.setStreamVolume(AudioManager.STREAM_ALARM, volumenMaximo, 0);
                } catch (SecurityException e) {
                    volumenOriginal = -1; // política de "No molestar" no deja tocarlo: suena al volumen actual
                }
                // Pausa lo que esté sonando (música, video) mientras habla el aviso.
                if (Build.VERSION.SDK_INT >= 26) {
                    foco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                        .setAudioAttributes(ATRIBUTOS_ALARMA)
                        .build();
                    am.requestAudioFocus(foco);
                }
            }

            vibrar(ctx);
            campanita();

            File audio = descargarAudio(ctx, base, audioUrl);
            boolean ok = false;
            if (audio != null) ok = reproducirArchivo(audio);
            if (!ok) ok = hablarConVozLocal(ctx, textoLocucion);
            if (!ok) sonarAlarmaDeRespaldo(ctx); // sin voz de ningún tipo: al menos suena
            if (audio != null) //noinspection ResultOfMethodCallIgnored
                audio.delete();
            return ok;
        } catch (Exception e) {
            return false;
        } finally {
            if (am != null) {
                if (volumenOriginal >= 0) {
                    try {
                        am.setStreamVolume(AudioManager.STREAM_ALARM, volumenOriginal, 0);
                    } catch (Exception ignorada) {
                        // sin permiso para restaurarlo: queda como estaba el aviso
                    }
                }
                if (foco != null && Build.VERSION.SDK_INT >= 26) am.abandonAudioFocusRequest(foco);
            }
            if (wl != null && wl.isHeld()) wl.release();
        }
    }

    private static void vibrar(Context ctx) {
        try {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            long[] patron = { 0, 500, 200, 500, 200, 900 };
            if (Build.VERSION.SDK_INT >= 26) {
                // Con atributos de alarma para que el modo silencio no la anule.
                v.vibrate(VibrationEffect.createWaveform(patron, -1), ATRIBUTOS_ALARMA);
            } else {
                v.vibrate(patron, -1);
            }
        } catch (Exception ignorada) {
            // sin vibrador o sin permiso: el aviso sigue
        }
    }

    /** Campanita institucional de dos notas por el canal de ALARMA. */
    private static void campanita() {
        ToneGenerator tg = null;
        try {
            tg = new ToneGenerator(android.media.AudioManager.STREAM_ALARM, 100);
            tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 700);
            Thread.sleep(800);
            tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 700);
            Thread.sleep(900);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignorada) {
            // sin campanita: la voz igual sale
        } finally {
            if (tg != null) tg.release();
        }
    }

    /** Descarga el WAV institucional con la sesión de la app. null si no hay audio. */
    private static File descargarAudio(Context ctx, String base, String audioUrl) {
        if (audioUrl == null || audioUrl.isEmpty()) return null;
        HttpURLConnection con = null;
        try {
            String cookie = CookieManager.getInstance().getCookie(base);
            con = (HttpURLConnection) new URL(base + audioUrl).openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(15000);
            if (cookie != null) con.setRequestProperty("Cookie", cookie);
            if (con.getResponseCode() != 200) return null;
            File destino = File.createTempFile("aviso", ".wav", ctx.getCacheDir());
            try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(destino)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return destino;
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static boolean reproducirArchivo(File archivo) {
        MediaPlayer mp = new MediaPlayer();
        CountDownLatch fin = new CountDownLatch(1);
        boolean[] completo = { false };
        try {
            mp.setAudioAttributes(ATRIBUTOS_ALARMA);
            mp.setDataSource(archivo.getAbsolutePath());
            mp.setOnCompletionListener(p -> {
                completo[0] = true;
                fin.countDown();
            });
            mp.setOnErrorListener((p, what, extra) -> {
                fin.countDown();
                return true;
            });
            mp.prepare();
            mp.start();
            fin.await(MAX_ESPERA_VOZ_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignorada) {
            completo[0] = false;
        } finally {
            try {
                mp.release();
            } catch (Exception ignorada) {
                // ya liberado
            }
        }
        return completo[0];
    }

    /** Voz local del teléfono (respaldo cuando el backend no pudo generar el audio). */
    private static boolean hablarConVozLocal(Context ctx, String texto) {
        if (texto == null || texto.isEmpty()) return false;
        CountDownLatch listo = new CountDownLatch(1);
        CountDownLatch fin = new CountDownLatch(1);
        boolean[] resultado = { false, false }; // [0]=motor listo, [1]=terminó bien
        TextToSpeech[] tts = new TextToSpeech[1];
        tts[0] = new TextToSpeech(ctx.getApplicationContext(), status -> {
            resultado[0] = status == TextToSpeech.SUCCESS;
            listo.countDown();
        });
        try {
            if (!listo.await(6, TimeUnit.SECONDS) || !resultado[0]) return false;
            tts[0].setAudioAttributes(ATRIBUTOS_ALARMA);
            int idioma = tts[0].setLanguage(new Locale("es", "CO"));
            if (idioma == TextToSpeech.LANG_MISSING_DATA || idioma == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts[0].setLanguage(new Locale("es"));
            }
            tts[0].setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {}

                @Override
                public void onDone(String id) {
                    resultado[1] = true;
                    fin.countDown();
                }

                @Override
                public void onError(String id) {
                    fin.countDown();
                }
            });
            if (tts[0].speak(texto, TextToSpeech.QUEUE_FLUSH, null, "aviso") != TextToSpeech.SUCCESS) return false;
            fin.await(MAX_ESPERA_VOZ_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            tts[0].stop();
            tts[0].shutdown();
        }
        return resultado[1];
    }

    private static void sonarAlarmaDeRespaldo(Context ctx) {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            Ringtone r = RingtoneManager.getRingtone(ctx, uri);
            if (r == null) return;
            r.setAudioAttributes(ATRIBUTOS_ALARMA);
            r.play();
            Thread.sleep(4000);
            r.stop();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignorada) {
            // sin tono de alarma disponible
        }
    }

    /** PUT {estado} contra la ruta de confirmación del aviso, con la sesión de la app. */
    static void confirmarEstado(String base, String estadoUrl, String estado) {
        if (estadoUrl == null || estadoUrl.isEmpty()) return;
        HttpURLConnection con = null;
        try {
            String cookie = CookieManager.getInstance().getCookie(base);
            con = (HttpURLConnection) new URL(base + estadoUrl).openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setRequestMethod("PUT");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            if (cookie != null) con.setRequestProperty("Cookie", cookie);
            try (OutputStream out = con.getOutputStream()) {
                out.write(("{\"estado\":\"" + estado + "\"}").getBytes(StandardCharsets.UTF_8));
            }
            con.getResponseCode(); // fuerza el envío; el resultado no cambia nada para el usuario
        } catch (Exception ignorada) {
            // sin red: el backend lo seguirá viendo "enviado" y lo reenviará al reconectar
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
