package com.dhakkamukki.local;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.net.wifi.WifiManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Foreground service that owns the room: the local server, the isolated engine WebView and the 30 Hz tick.
 * Players keep playing while the host app is minimised.
 */
public class HostingService extends Service implements GameServer.Host {
    static final int PORT = 8793;
    static HostingService active;

    interface Listener { void ready(HostingService s); }

    Listener listener;
    GameServer server;
    String hostToken, failure;
    WifiManager.LocalOnlyHotspotReservation hotspot;

    private WebView engine;
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ConcurrentLinkedQueue<String> events = new ConcurrentLinkedQueue<String>();
    private final ConcurrentHashMap<String, byte[]> assetCache = new ConcurrentHashMap<String, byte[]>();
    private volatile boolean closed = false, engineReady = false;
    private boolean inFlight = false;
    private long lastTick = 0, flightStart = 0;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (closed) return;
            long now = SystemClock.uptimeMillis();
            if (inFlight && now - flightStart > 1500) inFlight = false; // renderer hiccup: never stall the room
            if (engineReady && engine != null && !inFlight) step(now);
            main.postDelayed(this, 33);
        }
    };

    final class LocalBinder extends Binder { HostingService get() { return HostingService.this; } }

    @Override public IBinder onBind(Intent intent) { return new LocalBinder(); }

    void notifyListener() { if (listener != null) listener.ready(this); }

    @Override public void onCreate() {
        super.onCreate();
        active = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("hosting", "Game hosting", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, "hosting")
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Dhakka Mukki room is running")
                .setContentText("Players can keep playing while you use other apps.")
                .setContentIntent(PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .setOngoing(true)
                .addAction(new Notification.Action.Builder((Icon) null, "Stop hosting",
                        PendingIntent.getService(this, 1, new Intent(this, HostingService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build())
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(101, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        else startForeground(101, n);
        wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Dhakka:hosting");
        wake.acquire();
        wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Dhakka:network");
        wifi.acquire();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { shutdown(); stopSelf(); return START_NOT_STICKY; }
        if (engine != null) return START_NOT_STICKY;
        try {
            server = new GameServer(PORT, this);
            server.start();
        } catch (IOException e) {
            failure = "Could not start the local server. Another app may be using port " + PORT + ".";
            notifyListener(); shutdown(); stopSelf(); return START_NOT_STICKY;
        }
        engine = new WebView(getApplicationContext());
        engine.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        WebSettings ws = engine.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(false);
        ws.setBlockNetworkLoads(true);
        engine.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !r.getUrl().toString().startsWith("file:///android_asset/"); }
        });
        engine.addJavascriptInterface(new EngineBridge(), "NativeEngine");
        engine.loadUrl("file:///android_asset/engine.html");
        lastTick = SystemClock.uptimeMillis();
        main.post(ticker);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() { shutdown(); super.onDestroy(); }

    void shutdown() {
        if (closed) return;
        closed = true; engineReady = false;
        main.removeCallbacks(ticker);
        if (server != null) server.close();
        if (hotspot != null) hotspot.close();
        if (engine != null) engine.destroy();
        if (wifi != null && wifi.isHeld()) wifi.release();
        if (wake != null && wake.isHeld()) wake.release();
        failure = "Hosting stopped. Reopen Dhakka Mukki to start a new room.";
        notifyListener();
        listener = null; active = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    /* ---------- engine tick ---------- */

    private void step(long now) {
        long ms = Math.min(250, now - lastTick);
        lastTick = now;
        StringBuilder b = new StringBuilder(256).append('[');
        String ev; int n = 0;
        while (n < 3000 && (ev = events.poll()) != null) { if (n++ > 0) b.append(','); b.append(ev); }
        b.append(']');
        inFlight = true; flightStart = now;
        engine.evaluateJavascript("window.nativeStep(" + Json.quote(b) + "," + ms + ")", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                inFlight = false;
                String out = Json.unquote(value);
                if (out == null || out.isEmpty() || server == null) return;
                int start = 0;
                while (start < out.length()) {
                    int nl = out.indexOf('\n', start); if (nl < 0) nl = out.length();
                    int tab = out.indexOf('\t', start);
                    if (tab > start && tab < nl) server.dispatch(out.substring(start, tab), out.substring(tab + 1, nl));
                    start = nl + 1;
                }
            }
        });
    }

    /* ---------- GameServer.Host (called on server threads) ---------- */

    @Override public boolean ready() { return engineReady && !closed; }
    @Override public void open(String cid) { events.add("[\"o\"," + Json.quote(cid) + "]"); }
    @Override public void text(String cid, String text) { if (events.size() < 6000) events.add("[\"m\"," + Json.quote(cid) + "," + Json.quote(text) + "]"); }
    @Override public void closed(String cid) { events.add("[\"c\"," + Json.quote(cid) + "]"); }

    @Override public byte[] asset(String path) throws IOException {
        byte[] cached = assetCache.get(path);
        if (cached != null) return cached;
        InputStream in = getAssets().open("web/" + path);
        try { byte[] all = readAll(in, 16 * 1024 * 1024); assetCache.put(path, all); return all; } finally { in.close(); }
    }

    @Override public String invite(String hostHeader, boolean local) {
        List<String> urls = new ArrayList<String>();
        if (local) for (String ip : addresses()) urls.add("http://" + ip + ":" + PORT + "/");
        else urls.add("http://" + hostHeader + "/");
        StringBuilder b = new StringBuilder("{\"ok\":true,\"urls\":[");
        for (int i = 0; i < urls.size(); i++) { if (i > 0) b.append(','); b.append(Json.quote(urls.get(i))); }
        String qr = urls.isEmpty() ? null : qrDataUri(urls.get(0), 360);
        return b.append("],\"qr\":").append(qr == null ? "null" : Json.quote(qr)).append('}').toString();
    }

    final class EngineBridge {
        @JavascriptInterface public void ready(final String token) {
            if (token == null || !token.matches("[A-Za-z0-9_-]{16,200}")) return;
            main.post(new Runnable() { @Override public void run() { hostToken = token; engineReady = true; notifyListener(); } });
        }
        @JavascriptInterface public void failure(final String msg) {
            main.post(new Runnable() { @Override public void run() { failure = msg; notifyListener(); } });
        }
    }

    /* ---------- helpers ---------- */

    static List<String> addresses() {
        List<String> out = new ArrayList<String>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase(Locale.ROOT);
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("pdp") || name.startsWith("tun") || name.startsWith("wg")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses()))
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) out.add(a.getHostAddress());
            }
        } catch (Exception ignored) { }
        Collections.sort(out);
        return out;
    }

    static Bitmap qrBitmap(String text, int size, int dark) {
        try {
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size);
            int[] px = new int[size * size];
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) px[y * size + x] = m.get(x, y) ? dark : 0xFFFFFFFF;
            return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888);
        } catch (Exception e) { return null; }
    }

    static String qrDataUri(String text, int size) {
        Bitmap b = qrBitmap(text, size, 0xFF1C0B33);
        if (b == null) return null;
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, o);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(o.toByteArray());
    }

    static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int r;
        while ((r = in.read(buf)) != -1) { if (o.size() + r > max) throw new IOException("too large"); o.write(buf, 0, r); }
        return o.toByteArray();
    }
}
