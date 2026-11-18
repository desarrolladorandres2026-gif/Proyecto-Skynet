package online.skynetttn.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;

/** Puente JS <-> servicio de notificaciones propio (sin Firebase). */
@CapacitorPlugin(
    name = "SkynetNotif",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notificaciones") }
)
public class NotifPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(NotifService.PREFS, Context.MODE_PRIVATE);
    }

    private boolean permisoConcedido() {
        return Build.VERSION.SDK_INT < 33 || getPermissionState("notificaciones") == PermissionState.GRANTED;
    }

    @Override
    public void load() {
        // Arranque en frío tocando una notificación.
        if (getActivity() != null) avisarToque(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        avisarToque(intent);
    }

    private void avisarToque(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra(NotifService.EXTRA_URL);
        if (url == null) return;
        intent.removeExtra(NotifService.EXTRA_URL);
        JSObject o = new JSObject();
        o.put("url", url);
        // retainUntilConsumed: si la web aún no escucha, se entrega al registrar el listener.
        notifyListeners("notificacionTocada", o, true);
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("activo", prefs().getBoolean("activo", false));
        r.put("permiso", permisoConcedido() ? "granted" : "denied");
        r.put("dispositivoId", prefs().getString("dispositivoId", null));
        r.put("sinOptimizacion", sinOptimizacion());
        r.put("pantallaCompleta", pantallaCompletaPermitida());
        r.put("noMolestar", noMolestarPermitido());
        call.resolve(r);
    }

    /**
     * Android 14+ puede revocar el permiso de pantalla completa (la alerta ya
     * no enciende la pantalla). Antes de 14 siempre está concedido.
     */
    private boolean pantallaCompletaPermitida() {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /** Acceso a "No molestar": permite que el canal de emergencia lo omita por completo. */
    private boolean noMolestarPermitido() {
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    /**
     * Abre el ajuste del sistema que corresponde. `tipo`: notificaciones |
     * bateria | pantallaCompleta | noMolestar. Cada uno lleva a la pantalla
     * exacta (no a "Ajustes" en general) para que la persona solo tenga que
     * activar un interruptor.
     */
    @PluginMethod
    public void abrirAjuste(PluginCall call) {
        String tipo = call.getString("tipo", "");
        String paquete = getContext().getPackageName();
        Intent i;
        switch (tipo) {
            case "bateria":
                pedirSinOptimizacion(call);
                return;
            case "pantallaCompleta":
                if (Build.VERSION.SDK_INT >= 34) {
                    i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + paquete));
                } else {
                    call.resolve();
                    return;
                }
                break;
            case "noMolestar":
                i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                break;
            case "notificaciones":
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, paquete);
                break;
            default:
                call.reject("Ajuste desconocido");
                return;
        }
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Este teléfono no permite abrir ese ajuste");
        }
    }

    /**
     * "Probar alerta": dispara en el propio teléfono una alerta idéntica a la
     * de un aviso real (campanita, voz por el canal de alarma, notificación de
     * pantalla completa), sin pasar por el backend ni crear ningún aviso.
     */
    @PluginMethod
    public void probarAlerta(PluginCall call) {
        if (!permisoConcedido()) {
            call.reject("Falta el permiso de notificaciones");
            return;
        }
        Intent i = new Intent(getContext(), NotifService.class).setAction(NotifService.ACCION_PRUEBA);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
        else getContext().startService(i);
        call.resolve();
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        if (!permisoConcedido()) {
            requestPermissionForAlias("notificaciones", call, "trasPermiso");
            return;
        }
        arrancar(call);
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        if (permisoConcedido()) {
            arrancar(call);
        } else {
            JSObject r = new JSObject();
            r.put("permiso", "denied");
            call.resolve(r);
        }
    }

    private void arrancar(PluginCall call) {
        SharedPreferences p = prefs();
        String id = p.getString("dispositivoId", null);
        if (id == null) id = UUID.randomUUID().toString();
        p.edit().putString("dispositivoId", id).putBoolean("activo", true).apply();
        NotifService.iniciar(getContext());
        JSObject r = new JSObject();
        r.put("permiso", "granted");
        r.put("dispositivoId", id);
        r.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
        call.resolve(r);
    }

    @PluginMethod
    public void detener(PluginCall call) {
        prefs().edit().putBoolean("activo", false).apply();
        getContext().stopService(new Intent(getContext(), NotifService.class));
        call.resolve();
    }

    private boolean sinOptimizacion() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    /** Pide al sistema que no "duerma" la app: sin esto algunos fabricantes cortan la conexión. */
    @PluginMethod
    public void pedirSinOptimizacion(PluginCall call) {
        if (!sinOptimizacion()) {
            Intent i = new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getContext().getPackageName())
            );
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }
}
