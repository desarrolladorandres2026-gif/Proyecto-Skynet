package online.skynetttn.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Servicio en primer plano que mantiene una conexión SSE con el backend propio
 * (GET /api/notificaciones/stream) y muestra cada notificación recibida.
 * No usa Firebase ni ningún servicio de terceros.
 */
public class NotifService extends Service {

    static final String PREFS = "skynet_notif";
    static final String CANAL_SERVICIO = "servicio";
    static final String CANAL_AVISOS = "avisos";
    static final String CANAL_EMERGENCIA = "avisos_emergencia";
    static final String ACCION_PRUEBA = "online.skynetttn.app.PROBAR_ALERTA";
    static final String EXTRA_URL = "skynet_url";

    private volatile boolean corriendo = false;
    private Thread hilo;
    // Un solo hilo: los avisos suenan en fila, nunca encimados.
    private final ExecutorService avisos = Executors.newSingleThreadExecutor();
    private final Set<String> avisosVistos = new LinkedHashSet<>();

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        crearCanales(this);
        Notification n = new NotificationCompat.Builder(this, CANAL_SERVICIO)
            .setSmallIcon(R.drawable.ic_stat_notif)
            .setContentTitle("TTN Neiva")
            .setContentText("Recibiendo notificaciones")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(abrirApp(this, null, 0))
            .build();
        int tipo = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, 1, n, tipo);

        // "Probar alerta" (ver NotifPlugin#probarAlerta): mismo camino que un
        // aviso real, solo que sin audio del servidor (suena con la voz local)
        // ni confirmaciones contra el backend (no hay estadoUrl).
        if (intent != null && ACCION_PRUEBA.equals(intent.getAction())) {
            try {
                JSONObject prueba = new JSONObject();
                prueba.put("entregaId", "prueba-" + System.currentTimeMillis());
                prueba.put("title", "Prueba de alerta");
                prueba.put("body", "Si escuchas esto, tu teléfono está listo para recibir avisos del Terminal.");
                prueba.put("textoLocucion", "Prueba de alerta. El Terminal de Transportes de Neiva informa que: si escuchas este mensaje, tu teléfono está listo para recibir avisos.");
                prueba.put("url", "/notificaciones/preferencias");
                recibirAviso(prueba.toString());
            } catch (Exception e) {
                // JSON de prueba mal armado: imposible, pero no debe tumbar el servicio.
            }
        }

        if (hilo == null || !hilo.isAlive()) {
            corriendo = true;
            hilo = new Thread(this::bucle, "skynet-notif");
            hilo.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        corriendo = false;
        if (hilo != null) hilo.interrupt();
        avisos.shutdownNow();
        super.onDestroy();
    }

    private void bucle() {
        long espera = 5000;
        while (corriendo) {
            try {
                conectar();
                espera = 5000; // cierre limpio del servidor: reconecta pronto
            } catch (SinSesion e) {
                espera = 60000; // sin login en la app: revisa cada minuto
            } catch (Exception e) {
                espera = Math.min(espera * 2, 60000);
            }
            try {
                Thread.sleep(espera);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private static class SinSesion extends Exception {}

    private void conectar() throws Exception {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String dispositivo = prefs.getString("dispositivoId", null);
        String base = getString(R.string.skynet_base_url);
        String cookie = CookieManager.getInstance().getCookie(base);
        if (dispositivo == null || cookie == null || cookie.isEmpty()) throw new SinSesion();

        URL url = new URL(base + "/api/notificaciones/stream?dispositivo=" + dispositivo);
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        try {
            con.setConnectTimeout(15000);
            con.setReadTimeout(70000); // el servidor manda latido cada 25 s
            con.setRequestProperty("Accept", "text/event-stream");
            con.setRequestProperty("Cookie", cookie);
            int codigo = con.getResponseCode();
            if (codigo == 401 || codigo == 403 || codigo == 404) throw new SinSesion();
            if (codigo != 200) throw new Exception("HTTP " + codigo);

            BufferedReader lector = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8));
            String evento = null;
            StringBuilder datos = new StringBuilder();
            String linea;
            while (corriendo && (linea = lector.readLine()) != null) {
                if (linea.isEmpty()) {
                    if (datos.length() > 0) {
                        if ("notificacion".equals(evento)) mostrar(datos.toString());
                        else if ("aviso_terminal".equals(evento)) recibirAviso(datos.toString());
                    }
                    evento = null;
                    datos.setLength(0);
                } else if (linea.startsWith("event:")) {
                    evento = linea.substring(6).trim();
                } else if (linea.startsWith("data:")) {
                    datos.append(linea.substring(5).trim());
                }
            }
        } finally {
            con.disconnect();
        }
    }

    private void mostrar(String json) {
        try {
            JSONObject o = new JSONObject(json);
            String id = o.optString("id", String.valueOf(System.currentTimeMillis()));
            String url = o.optString("url", "/");
            int nid = id.hashCode();
            String cuerpo = o.optString("body", "");
            Notification n = new NotificationCompat.Builder(this, CANAL_AVISOS)
                .setSmallIcon(R.drawable.ic_stat_notif)
                .setContentTitle(o.optString("title", "TTN Neiva"))
                .setContentText(cuerpo)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(abrirApp(this, url, nid))
                .build();
            NotificationManagerCompat.from(this).notify(nid, n);
        } catch (SecurityException e) {
            // Sin permiso POST_NOTIFICATIONS: no se muestra.
        } catch (Exception e) {
            // Trama mal formada: se ignora.
        }
    }

    /**
     * Aviso Terminal de Neiva: se comporta como una alerta de emergencia.
     * Se encola en un ejecutor propio (un solo hilo) para NO bloquear la
     * lectura del SSE mientras habla, y para que dos avisos seguidos no suenen
     * encimados.
     */
    private void recibirAviso(String json) {
        try {
            JSONObject o = new JSONObject(json);
            // El backend reenvía lo pendiente al reconectar: el mismo aviso
            // puede llegar dos veces. Una sola vez por ENVÍO (claveEnvio =
            // entrega + n.º de reenvío: un reenvío manual del administrador sí
            // debe volver a sonar).
            String claveEnvio = o.optString("claveEnvio", o.optString("entregaId", ""));
            synchronized (avisosVistos) {
                if (!claveEnvio.isEmpty() && !avisosVistos.add(claveEnvio)) return;
                if (avisosVistos.size() > 50) avisosVistos.remove(avisosVistos.iterator().next());
            }
            // Un anuncio en vivo caducado (1 h, igual que el backend) ya no corresponde.
            long creado = o.optLong("creadoEn", System.currentTimeMillis());
            if (System.currentTimeMillis() - creado > 60 * 60 * 1000L) return;

            mostrarAvisoEmergencia(o);
            avisos.execute(() -> {
                String base = getString(R.string.skynet_base_url);
                String estadoUrl = o.optString("estadoUrl", "");
                AvisoAlarma.confirmarEstado(base, estadoUrl, "entregado");
                boolean completo = AvisoAlarma.reproducir(this, base, o.optString("audioUrl", ""), o.optString("textoLocucion", ""));
                if (completo) AvisoAlarma.confirmarEstado(base, estadoUrl, "reproducido");
            });
        } catch (Exception e) {
            // Trama mal formada: se ignora.
        }
    }

    /**
     * Notificación de máxima prioridad con pantalla completa: enciende la
     * pantalla y se muestra completa en el bloqueo (VISIBILITY_PUBLIC: es un
     * anuncio institucional, no un dato privado). A propósito NO se activa
     * setShowWhenLocked en la Activity: abriría toda la sesión de la app sobre
     * un teléfono bloqueado. El texto se lee en la notificación; la app se abre
     * al desbloquear y tocarla.
     */
    private void mostrarAvisoEmergencia(JSONObject o) {
        try {
            String id = o.optString("entregaId", String.valueOf(System.currentTimeMillis()));
            int nid = id.hashCode();
            String cuerpo = o.optString("body", "");
            PendingIntent abrir = abrirApp(this, o.optString("url", "/avisos-terminal/mios"), nid);
            Notification n = new NotificationCompat.Builder(this, CANAL_EMERGENCIA)
                .setSmallIcon(R.drawable.ic_stat_notif)
                .setContentTitle(o.optString("title", "Terminal de Transportes de Neiva"))
                .setContentText(cuerpo)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
                .setFullScreenIntent(abrir, true)
                .setContentIntent(abrir)
                .setAutoCancel(true)
                .build();
            NotificationManagerCompat.from(this).notify(nid, n);
        } catch (SecurityException e) {
            // Sin permiso POST_NOTIFICATIONS: la voz igual suena.
        } catch (Exception e) {
            // Trama mal formada: se ignora.
        }
    }

    static PendingIntent abrirApp(Context ctx, String url, int requestCode) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) i.putExtra(EXTRA_URL, url);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void crearCanales(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CANAL_SERVICIO, "Conexión en segundo plano", NotificationManager.IMPORTANCE_MIN));
        NotificationChannel avisos = new NotificationChannel(CANAL_AVISOS, "Notificaciones", NotificationManager.IMPORTANCE_HIGH);
        avisos.enableVibration(true);
        nm.createNotificationChannel(avisos);

        // Avisos Terminal de Neiva. El sonido NO lo pone el canal sino
        // AvisoAlarma (canal de audio de ALARMA, voz institucional): por eso
        // el canal es mudo aquí, para no duplicar sonido. Lo que SÍ aporta es
        // IMPORTANCE_HIGH + omitir "No molestar" + visible en el bloqueo, que
        // es lo que permite encender la pantalla con fullScreenIntent.
        NotificationChannel emergencia = new NotificationChannel(CANAL_EMERGENCIA, "Avisos del Terminal (emergencia)", NotificationManager.IMPORTANCE_HIGH);
        emergencia.setSound(null, null);
        emergencia.enableVibration(true);
        emergencia.setBypassDnd(true);
        emergencia.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(emergencia);
    }

    static void iniciar(Context ctx) {
        Intent i = new Intent(ctx, NotifService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }
}
