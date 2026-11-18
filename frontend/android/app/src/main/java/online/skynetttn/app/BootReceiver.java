package online.skynetttn.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Reanuda el servicio de avisos al encender el celular o al actualizar la app:
 * sin esto, tras un reinicio nadie recibiría una alerta hasta abrir la app a
 * mano. El receptor está exportado (lo exige BOOT_COMPLETED), así que se
 * valida la acción: cualquier otra app podría mandarle un Intent cualquiera.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String accion = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(accion) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) return;

        boolean activo = context.getSharedPreferences(NotifService.PREFS, Context.MODE_PRIVATE).getBoolean("activo", false);
        if (activo) {
            try {
                NotifService.iniciar(context);
            } catch (Exception e) {
                // El sistema puede negar el inicio en segundo plano; se reintenta al abrir la app
                // (AppShell vuelve a pedir SkynetNotif.iniciar() en cada apertura con sesión).
            }
        }
    }
}
