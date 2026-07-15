package uz.kamizo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Sprint 87 Phase 0 — must match FCM meta-data
    // `default_notification_channel_id` in AndroidManifest.xml.
    private static final String DEFAULT_CHANNEL_ID = "kamizo_default";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor's BridgeActivity.onCreate bootstraps the WebView
        // and registers plugin channels — must run first.
        super.onCreate(savedInstanceState);
        createDefaultNotificationChannel();
    }

    /**
     * Android 8+ (API 26) requires an explicit NotificationChannel
     * before FCM will deliver any notification bearing this channel
     * id. Created here at app boot so it exists before the first
     * push arrives — cheap idempotent op if the channel already
     * exists.
     *
     * Kept in code (not in FCM XML) because the channel needs a
     * user-visible name/description that follows the current app
     * locale — hardcoded RU strings here are acceptable for Phase 0;
     * Phase 1+ can pull from string resources when i18n polish lands.
     */
    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                DEFAULT_CHANNEL_ID,
                "Уведомления Kamizo",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Заявки, собрания, чат и другие важные события в вашем доме");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }
}
