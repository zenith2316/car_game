package com.dhakkamukki.local;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Presentation;
import android.hardware.display.DisplayManager;
import android.view.Display;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.util.List;

/** Host screen: the full-screen game display served by HostingService. A thin native bar shows only while the room
 *  starts; after that Connect players and Stop live in the game's own UI, through the DhakkaHost bridge. */
public class MainActivity extends Activity {
    static final int PERMISSION_WIFI = 30, PERMISSION_NOTIFY = 31;
    static final int NIGHT = Color.rgb(28, 11, 51), CREAM = Color.rgb(255, 244, 220), HALDI = Color.rgb(255, 194, 26);

    private LinearLayout layout, bar;
    private TextView status;
    private WebView display, tvView;
    private Presentation tv;
    private DisplayManager displays;
    private String token;
    private boolean tvOn, started;
    private HostingService hosting;
    private boolean bound, closed;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            hosting = ((HostingService.LocalBinder) binder).get();
            hosting.listener = new HostingService.Listener() { @Override public void ready(HostingService s) { onHostState(s); } };
            onHostState(hosting);
        }
        @Override public void onServiceDisconnected(ComponentName name) { hosting = null; }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(NIGHT);
        bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(2), dp(6), dp(2));
        bar.setBackgroundColor(NIGHT);
        TextView title = new TextView(this);
        title.setText("Dhakka Mukki");
        title.setTextColor(HALDI);
        title.setTextSize(17);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(40), 1f));
        title.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(barButton("Connect players", true, new View.OnClickListener() { @Override public void onClick(View v) { showInvite(); } }));
        bar.addView(barButton("Stop", false, new View.OnClickListener() { @Override public void onClick(View v) { confirmStop(); } }));
        layout.addView(bar);
        status = new TextView(this);
        status.setTextColor(CREAM);
        status.setText("Opening your mela…");
        status.setPadding(dp(16), dp(12), dp(16), dp(12));
        layout.addView(status);
        setContentView(layout);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            layout.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                    // system bars are hidden while playing, so only keep clear of a camera cutout
                    Insets i = in.getInsets(display != null ? WindowInsets.Type.displayCutout() : WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    v.setPadding(i.left, i.top, i.right, i.bottom);
                    return in;
                }
            });
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                @Override public void onBackInvoked() { moveTaskToBack(true); }
            });
        }
        startHost();
    }

    /* Immersive: the arena gets the whole screen. A swipe from the edge shows the system bars for a moment. */
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
        if (Build.VERSION.SDK_INT >= 28) { WindowManager.LayoutParams lp = getWindow().getAttributes(); lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES; getWindow().setAttributes(lp); }
        layout.requestApplyInsets();
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus && display != null) immersive(); }

    /** Called from the host's game UI (display page or the host's embedded controller). Only local pages load here. */
    final class HostBridge {
        @JavascriptInterface public void connect() { main.post(new Runnable() { @Override public void run() { if (!closed) showInvite(); } }); }
        @JavascriptInterface public void stop() { main.post(new Runnable() { @Override public void run() { if (!closed) confirmStop(); } }); }
        @JavascriptInterface public boolean tv() { return tvOn; }
        @JavascriptInterface public void openCast() { main.post(new Runnable() { @Override public void run() { openCastSettings(); } }); }
    }

    /* ---------- TV mode ----------
       When the phone is cast or mirrored to a TV (or plugged into one), Android offers that screen as a presentation
       display. The shared arena goes there on its own, and this phone switches to the host's private view and
       controller, so a Chupa Rustam host's role and traps never show on the TV. */
    private final DisplayManager.DisplayListener tvListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) { checkTv(); }
        @Override public void onDisplayRemoved(int id) { checkTv(); }
        @Override public void onDisplayChanged(int id) { checkTv(); }
    };
    private void checkTv() {
        if (closed || token == null || displays == null) return;
        Display[] ds = displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (ds.length > 0 && tv == null && started) showTv(ds[0]);
        else if (ds.length == 0 && (tv != null || tvOn)) hideTv(true);
    }
    private void showTv(Display d) {
        try {
            final Presentation p = new Presentation(this, d);
            tvView = localWebView(p.getContext());
            p.setContentView(tvView);
            p.setOnDismissListener(new DialogInterface.OnDismissListener() { @Override public void onDismiss(DialogInterface di) { if (tv == p) { tv = null; if (tvView != null) { tvView.destroy(); tvView = null; } } } });
            p.show();
            tv = p;
            tvView.loadUrl(base() + "/display?tv=1");
            if (!tvOn) { tvOn = true; display.loadUrl(base() + "/#host=" + token); Toast.makeText(this, "Arena is on the TV. This phone is now your private view.", Toast.LENGTH_LONG).show(); }
        } catch (Exception e) {
            tv = null; if (tvView != null) { tvView.destroy(); tvView = null; }
        }
    }
    private void hideTv(boolean restore) {
        Presentation p = tv; tv = null;
        if (p != null) p.dismiss();
        if (tvView != null) { tvView.destroy(); tvView = null; }
        if (restore && tvOn && display != null) { tvOn = false; display.loadUrl(base() + "/display#host=" + token); }
    }
    private void openCastSettings() {
        try { startActivity(new Intent(android.provider.Settings.ACTION_CAST_SETTINGS)); }
        catch (Exception e) { try { startActivity(new Intent(android.provider.Settings.ACTION_DISPLAY_SETTINGS)); } catch (Exception ignored) { } }
    }
    private static String base() { return "http://127.0.0.1:" + HostingService.PORT; }
    private WebView localWebView(Context ctx) {
        WebView w = new WebView(ctx);
        WebSettings ws = w.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setUserAgentString(ws.getUserAgentString() + " DhakkaNative/1");
        w.setBackgroundColor(NIGHT);
        w.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !LocalOrigin.allows(r.getUrl().toString(), HostingService.PORT); }
        });
        w.setWebChromeClient(new android.webkit.WebChromeClient());
        return w;
    }
    @Override protected void onStart() { super.onStart(); started = true; checkTv(); }
    @Override protected void onStop() { started = false; hideTv(false); super.onStop(); }

    private Button barButton(String text, boolean primary, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTextColor(primary ? NIGHT : CREAM);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary ? HALDI : Color.rgb(59, 26, 92)));
        b.setMinHeight(dp(40)); b.setMinimumHeight(dp(40));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44));
        lp.leftMargin = dp(6);
        b.setLayoutParams(lp);
        return b;
    }

    @Override public void onBackPressed() { moveTaskToBack(true); }

    private void startHost() {
        Intent i = new Intent(this, HostingService.class);
        try {
            startForegroundService(i);
            bound = bindService(i, connection, Context.BIND_AUTO_CREATE);
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0)
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, PERMISSION_NOTIFY);
        } catch (Exception e) {
            status.setText("Background hosting could not start: " + e.getMessage());
        }
    }

    private void onHostState(final HostingService s) {
        main.post(new Runnable() {
            @Override public void run() {
                if (closed) return;
                if (s.failure != null && s.hostToken == null) { status.setVisibility(View.VISIBLE); status.setText(s.failure); return; }
                if (s.failure != null && display != null) { status.setVisibility(View.VISIBLE); status.setText(s.failure); return; }
                if (s.hostToken != null && display == null) showDisplay(s.hostToken);
            }
        });
    }

    private void showDisplay(String token) {
        this.token = token;
        status.setVisibility(View.GONE);
        display = localWebView(this);
        display.addJavascriptInterface(new HostBridge(), "DhakkaHost");
        bar.setVisibility(View.GONE);
        immersive();
        layout.addView(display, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        display.loadUrl(base() + "/display#host=" + token);
        displays = getSystemService(DisplayManager.class);
        displays.registerDisplayListener(tvListener, main);
        checkTv();
    }

    private void confirmStop() {
        new AlertDialog.Builder(this).setTitle("Stop hosting?").setMessage("This disconnects every player and ends the match.")
                .setPositiveButton("Stop", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) { startService(new Intent(MainActivity.this, HostingService.class).setAction("STOP")); finish(); }
                }).setNegativeButton("Cancel", null).show();
    }

    @Override protected void onDestroy() {
        closed = true;
        if (hosting != null) hosting.listener = null;
        if (bound) { unbindService(connection); bound = false; }
        if (displays != null) displays.unregisterDisplayListener(tvListener);
        hideTv(false);
        if (display != null) display.destroy();
        super.onDestroy();
    }

    /* ---------- Connect players ---------- */

    private void showInvite() {
        new AlertDialog.Builder(this).setTitle("Connect players")
                .setItems(new String[]{"Same Wi-Fi / router", "Local hotspot from this phone"}, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) { showNetwork(which == 1); }
                }).setNegativeButton("Close", null).show();
    }

    private void showNetwork(boolean hotspotMode) {
        ScrollView sv = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(12), dp(20), dp(16));
        sv.addView(box);
        TextView intro = new TextView(this);
        intro.setTextSize(16);
        intro.setText(hotspotMode
                ? "Create a local hotspot below, then join it from every phone in Wi-Fi settings. Then scan the game QR."
                : "1. Put this device and every phone on the same Wi-Fi.\n2. Players scan the QR or type the address in Chrome or Safari.\n3. For a TV or laptop screen, open the display address there.\nUp to 10 players. No internet needed.");
        box.addView(intro);
        WifiManager.LocalOnlyHotspotReservation hs = hosting != null ? hosting.hotspot : null;
        if (hs != null) {
            TextView cred = new TextView(this);
            String ssid, pass;
            if (Build.VERSION.SDK_INT >= 30) { ssid = String.valueOf(hs.getSoftApConfiguration().getSsid()); pass = String.valueOf(hs.getSoftApConfiguration().getPassphrase()); }
            else { ssid = hs.getWifiConfiguration().SSID; pass = hs.getWifiConfiguration().preSharedKey; }
            cred.setText("\nHotspot: " + ssid + "\nPassword: " + pass);
            cred.setTextSize(17);
            cred.setTextIsSelectable(true);
            box.addView(cred);
        }
        List<String> ips = HostingService.addresses();
        if (ips.isEmpty()) {
            TextView t = new TextView(this);
            t.setText("\nNo Wi-Fi address yet. Connect to Wi-Fi or start the hotspot, then reopen Connect.");
            box.addView(t);
        }
        for (final String ip : ips) {
            final String url = "http://" + ip + ":" + HostingService.PORT + "/";
            android.graphics.Bitmap qr = HostingService.qrBitmap(url, 640, 0xFF000000);
            if (qr != null) {
                ImageView iv = new ImageView(this);
                iv.setImageBitmap(qr);
                iv.setContentDescription("Scan to join Dhakka Mukki at " + url);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(220), dp(220));
                lp.gravity = Gravity.CENTER_HORIZONTAL; lp.topMargin = dp(14);
                box.addView(iv, lp);
            }
            TextView u = new TextView(this);
            u.setText(url); u.setTextSize(18); u.setTextIsSelectable(true); u.setGravity(Gravity.CENTER_HORIZONTAL);
            box.addView(u);
            box.addView(copyButton("Copy player address", url));
            box.addView(copyButton("Copy TV / display address", url + "display"));
        }
        Button settings = new Button(this);
        settings.setText("Wi-Fi settings");
        settings.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { startActivity(new Intent(android.provider.Settings.ACTION_WIFI_SETTINGS)); } });
        box.addView(settings);
        Button hot = new Button(this);
        hot.setText(hs == null ? "Create local-only hotspot" : "Stop hotspot");
        hot.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (hosting != null && hosting.hotspot != null) { hosting.hotspot.close(); hosting.hotspot = null; Toast.makeText(MainActivity.this, "Hotspot stopped", Toast.LENGTH_SHORT).show(); }
                else startHotspot();
            }
        });
        box.addView(hot);
        TextView note = new TextView(this);
        note.setText("\nIf several addresses appear, use the Wi-Fi or hotspot one. Guest networks and AP isolation block phones from seeing each other, so use the main network. Hosting continues in the background until you press Stop.");
        box.addView(note);
        new AlertDialog.Builder(this).setTitle(hotspotMode ? "Local hotspot" : "Same Wi-Fi / router").setView(sv).setPositiveButton("Done", null).show();
    }

    private Button copyButton(String label, final String value) {
        Button b = new Button(this);
        b.setText(label);
        b.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Dhakka Mukki", value));
                Toast.makeText(MainActivity.this, "Copied", Toast.LENGTH_SHORT).show();
            }
        });
        return b;
    }

    private void startHotspot() {
        String perm = Build.VERSION.SDK_INT >= 33 ? "android.permission.NEARBY_WIFI_DEVICES" : "android.permission.ACCESS_FINE_LOCATION";
        if (checkSelfPermission(perm) != 0) { requestPermissions(new String[]{perm}, PERMISSION_WIFI); return; }
        try {
            ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override public void onStarted(WifiManager.LocalOnlyHotspotReservation r) {
                    if (closed || hosting == null) { r.close(); return; }
                    hosting.hotspot = r;
                    Toast.makeText(MainActivity.this, "Hotspot ready. Reopen Connect for the name and password.", Toast.LENGTH_LONG).show();
                }
                @Override public void onStopped() { if (hosting != null) hosting.hotspot = null; }
                @Override public void onFailed(int reason) { Toast.makeText(MainActivity.this, "Hotspot unavailable (" + reason + "). Use your Wi-Fi instead.", Toast.LENGTH_LONG).show(); }
            }, main);
        } catch (Exception e) {
            Toast.makeText(this, "Hotspot could not start. Turn on Wi-Fi and location, or use your Wi-Fi.", Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == PERMISSION_WIFI) {
            if (results.length > 0 && results[0] == 0) startHotspot();
            else Toast.makeText(this, "Permission denied. Your existing Wi-Fi still works.", Toast.LENGTH_LONG).show();
        }
    }

    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
