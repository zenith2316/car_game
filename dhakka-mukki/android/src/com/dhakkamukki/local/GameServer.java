package com.dhakkamukki.local;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Local game server: static files, two JSON endpoints and a WebSocket channel for real-time play.
 * Pure Java (no Android imports) so it can be tested on a desktop JVM.
 * Same hardening as IKKP: Host header must match, Origin must match, size limits, per-IP HTTP rate limit.
 */
public final class GameServer {
    public interface Host {
        byte[] asset(String path) throws IOException;
        String invite(String hostHeader, boolean local);
        boolean ready();
        void open(String cid);
        void text(String cid, String text);
        void closed(String cid);
    }

    static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    static final int MAX_SOCKETS = 24, MAX_FRAME = 4096, MAX_QUEUE = 48, MAX_MSG_PER_SEC = 150;
    static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

    final int port;
    private final Host host;
    private ServerSocket socket;
    private volatile boolean running;
    private final AtomicLong ids = new AtomicLong();
    final ConcurrentHashMap<String, Conn> conns = new ConcurrentHashMap<String, Conn>();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(4, 16, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<Runnable>(64));
    private final Map<String, ArrayDeque<Long>> rates = new HashMap<String, ArrayDeque<Long>>();

    public GameServer(int port, Host host) { this.port = port; this.host = host; }

    public void start() throws IOException {
        socket = new ServerSocket();
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress("0.0.0.0", port), 32);
        running = true;
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                while (running) {
                    try {
                        final Socket s = socket.accept();
                        try {
                            workers.execute(new Runnable() { @Override public void run() { handle(s); } });
                        } catch (RejectedExecutionException e) { quietClose(s); }
                    } catch (IOException e) { if (running) running = false; }
                }
            }
        }, "Dhakka-accept");
        t.setDaemon(true);
        t.start();
    }

    public void close() {
        running = false;
        try { socket.close(); } catch (Exception ignored) { }
        for (Conn c : conns.values()) c.shutdown();
        workers.shutdownNow();
    }

    /** Route one engine output line. target: client id, '*', 'D' (displays), 'P' (players) or '#' (kind control). */
    public void dispatch(String target, String text) {
        if ("#".equals(target)) {
            int i = text.lastIndexOf(':');
            if (i > 0) { Conn c = conns.get(text.substring(0, i)); if (c != null) c.kind = text.charAt(i + 1); }
            return;
        }
        byte[] frame = frame(text);
        if ("*".equals(target) || "D".equals(target) || "P".equals(target)) {
            char k = target.charAt(0);
            for (Conn c : conns.values()) if (k == '*' || c.kind == k) c.send(frame);
        } else {
            Conn c = conns.get(target);
            if (c != null) c.send(frame);
        }
    }

    public int connectionCount() { return conns.size(); }

    /* ---------------- HTTP ---------------- */

    synchronized boolean rate(String ip) {
        long now = System.currentTimeMillis();
        ArrayDeque<Long> q = rates.get(ip);
        if (q == null) { if (rates.size() > 128) rates.clear(); q = new ArrayDeque<Long>(); rates.put(ip, q); }
        while (!q.isEmpty() && q.peekFirst() < now - 10000) q.removeFirst();
        if (q.size() >= 300) return false;
        q.addLast(now);
        return true;
    }

    static String line(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        while (true) {
            int c = in.read();
            if (c == -1 || c == '\n') { if (c == -1 && b.size() == 0) return null; return b.toString("US-ASCII"); }
            if (c != '\r') b.write(c);
            if (b.size() > max) throw new IOException("line too large");
        }
    }

    void handle(Socket s) {
        boolean handedOver = false;
        try {
            s.setSoTimeout(10000);
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            String req = line(in, 4096);
            if (req == null) return;
            String[] parts = req.split(" ");
            if (parts.length != 3) { error(out, 400, "bad_request", "Invalid HTTP request"); return; }
            Map<String, String> h = new HashMap<String, String>();
            int total = req.length();
            while (true) {
                String l = line(in, 4096);
                if (l == null || l.isEmpty()) break;
                total += l.length();
                if (total > 16384) throw new IOException("headers too large");
                int i = l.indexOf(':');
                if (i < 1) throw new IOException("bad header");
                String k = l.substring(0, i).trim().toLowerCase(Locale.ROOT);
                if (h.containsKey(k)) throw new IOException("duplicate header");
                h.put(k, l.substring(i + 1).trim());
            }
            String hostHeader = h.get("host");
            String mine = s.getLocalAddress().getHostAddress() + ":" + port;
            boolean local = hostHeader != null && (hostHeader.equals("127.0.0.1:" + port) || hostHeader.equals("localhost:" + port));
            if (hostHeader == null || !(hostHeader.equals(mine) || local)) { error(out, 403, "invalid_host", "Use the address shown by the host."); return; }
            if (!rate(s.getInetAddress().getHostAddress())) { error(out, 429, "rate_limited", "Please wait a moment."); return; }
            String method = parts[0], path = parts[1].split("\\?", 2)[0];

            if (method.equals("GET") && path.equals("/ws")) {
                String origin = h.get("origin"), key = h.get("sec-websocket-key"), upgrade = h.get("upgrade");
                if (upgrade == null || !upgrade.equalsIgnoreCase("websocket") || key == null || key.length() > 64) { error(out, 400, "bad_upgrade", "WebSocket upgrade required."); return; }
                if (origin != null && !origin.equals("http://" + hostHeader)) { error(out, 403, "invalid_origin", "Open the game from the host address."); return; }
                if (conns.size() >= MAX_SOCKETS) { error(out, 503, "full", "Too many screens connected."); return; }
                if (!host.ready()) { error(out, 503, "not_ready", "Host is still opening. Retry shortly."); return; }
                String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1").digest((key + WS_GUID).getBytes(StandardCharsets.US_ASCII)));
                out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.flush();
                s.setSoTimeout(0);
                s.setTcpNoDelay(true);
                Conn c = new Conn("c" + ids.incrementAndGet(), s, in, out);
                conns.put(c.id, c);
                handedOver = true;
                c.begin();
                return;
            }
            if (method.equals("GET") && (path.equals("/health") || path.equals("/api/info"))) {
                respond(out, 200, "application/json", ("{\"ok\":true,\"app\":\"Dhakka Mukki\",\"protocol\":1,\"ready\":" + host.ready() + "}").getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            if (method.equals("GET") && path.equals("/api/invite")) {
                respond(out, 200, "application/json; charset=utf-8", host.invite(hostHeader, local).getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            if (!method.equals("GET") && !method.equals("HEAD")) { error(out, 405, "method_not_allowed", "Unsupported method"); return; }
            String file;
            if (path.equals("/")) file = "index.html";
            else if (path.equals("/display")) file = "display.html";
            else if (path.matches("/[A-Za-z0-9_\\-]+(/[A-Za-z0-9_\\-]+)*\\.(js|css|svg|png|woff2|txt|glb|jpg|webp|ogg|json)") && !path.contains("..")) file = path.substring(1);
            else { error(out, 404, "not_found", "Page not found"); return; }
            byte[] body;
            try { body = host.asset(file); } catch (IOException e) { error(out, 404, "not_found", "Page not found"); return; }
            respond(out, 200, type(file), body, method.equals("HEAD"), file.startsWith("assets/") ? "public, max-age=3600" : "no-store");
        } catch (Exception ignored) {
        } finally {
            if (!handedOver) quietClose(s);
        }
    }

    static String type(String f) {
        if (f.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (f.endsWith(".css")) return "text/css; charset=utf-8";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".woff2")) return "font/woff2";
        if (f.endsWith(".txt")) return "text/plain; charset=utf-8";
        if (f.endsWith(".glb")) return "model/gltf-binary";
        if (f.endsWith(".jpg")) return "image/jpeg";
        if (f.endsWith(".webp")) return "image/webp";
        if (f.endsWith(".ogg")) return "audio/ogg";
        if (f.endsWith(".json")) return "application/json";
        return "text/html; charset=utf-8";
    }

    static void error(OutputStream out, int code, String c, String msg) throws IOException {
        respond(out, code, "application/json; charset=utf-8", ("{\"ok\":false,\"error\":{\"code\":" + Json.quote(c) + ",\"message\":" + Json.quote(msg) + "}}").getBytes(StandardCharsets.UTF_8), false);
    }

    static void respond(OutputStream out, int code, String type, byte[] body, boolean head) throws IOException { respond(out, code, type, body, head, "no-store"); }

    static void respond(OutputStream out, int code, String type, byte[] body, boolean head, String cache) throws IOException {
        out.write(("HTTP/1.1 " + code + " Response\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\nCache-Control: " + cache + "\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: SAMEORIGIN\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: " + CSP + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        if (!head) out.write(body);
        out.flush();
    }

    static void quietClose(Socket s) { try { s.close(); } catch (Exception ignored) { } }

    /* ---------------- WebSocket ---------------- */

    static byte[] frame(String text) { return frame(0x1, text.getBytes(StandardCharsets.UTF_8)); }

    static byte[] frame(int opcode, byte[] p) {
        int n = p.length, hl = n < 126 ? 2 : n < 65536 ? 4 : 10;
        byte[] f = new byte[hl + n];
        f[0] = (byte) (0x80 | opcode);
        if (n < 126) f[1] = (byte) n;
        else if (n < 65536) { f[1] = 126; f[2] = (byte) (n >> 8); f[3] = (byte) n; }
        else { f[1] = 127; for (int i = 0; i < 8; i++) f[2 + i] = (byte) (((long) n) >> (56 - 8 * i)); }
        System.arraycopy(p, 0, f, hl, n);
        return f;
    }

    final class Conn {
        final String id;
        final Socket s;
        final InputStream in;
        final OutputStream out;
        volatile char kind = '?';
        private final LinkedBlockingDeque<byte[]> queue = new LinkedBlockingDeque<byte[]>();
        private volatile boolean open = true;
        private long windowStart = 0;
        private int windowCount = 0;

        Conn(String id, Socket s, InputStream in, OutputStream out) { this.id = id; this.s = s; this.in = in; this.out = out; }

        void begin() {
            host.open(id);
            Thread w = new Thread(new Runnable() { @Override public void run() { writeLoop(); } }, "Dhakka-ws-out-" + id);
            w.setDaemon(true);
            w.start();
            Thread r = new Thread(new Runnable() { @Override public void run() { readLoop(); } }, "Dhakka-ws-in-" + id);
            r.setDaemon(true);
            r.start();
        }

        void send(byte[] f) {
            if (!open) return;
            if (queue.size() >= MAX_QUEUE) queue.pollFirst();
            queue.offerLast(f);
        }

        void writeLoop() {
            try {
                while (open) {
                    byte[] f = queue.pollFirst(1, TimeUnit.SECONDS);
                    if (f == null) continue;
                    out.write(f);
                    if (queue.isEmpty()) out.flush();
                }
            } catch (Exception e) { shutdown(); }
        }

        int readFully(byte[] b, int len) throws IOException {
            int got = 0;
            while (got < len) { int r = in.read(b, got, len - got); if (r < 0) throw new IOException("eof"); got += r; }
            return got;
        }

        void readLoop() {
            try {
                byte[] hdr = new byte[8], mask = new byte[4];
                while (open) {
                    readFully(hdr, 2);
                    boolean fin = (hdr[0] & 0x80) != 0;
                    int op = hdr[0] & 0x0F, len = hdr[1] & 0x7F;
                    boolean masked = (hdr[1] & 0x80) != 0;
                    if (len == 126) { readFully(hdr, 2); len = ((hdr[0] & 0xFF) << 8) | (hdr[1] & 0xFF); }
                    else if (len == 127) break;
                    if (!masked || !fin || len > MAX_FRAME) break;
                    readFully(mask, 4);
                    byte[] p = new byte[len];
                    readFully(p, len);
                    for (int i = 0; i < len; i++) p[i] ^= mask[i & 3];
                    if (op == 0x1) {
                        long now = System.currentTimeMillis();
                        if (now - windowStart >= 1000) { windowStart = now; windowCount = 0; }
                        if (++windowCount <= MAX_MSG_PER_SEC) host.text(id, new String(p, StandardCharsets.UTF_8));
                    } else if (op == 0x8) { send(frame(0x8, new byte[0])); break; }
                    else if (op == 0x9) send(frame(0xA, p));
                    else if (op != 0xA) break;
                }
            } catch (Exception ignored) {
            } finally { shutdown(); }
        }

        void shutdown() {
            if (!open) return;
            open = false;
            if (conns.remove(id) != null) host.closed(id);
            try { Thread.sleep(20); } catch (InterruptedException ignored) { }
            quietClose(s);
        }
    }

    /* Iterator kept for subclasses or tests that need to inspect connections. */
    Iterator<Conn> connections() { return conns.values().iterator(); }
}
