import com.dhakkamukki.local.GameServer;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.ConcurrentLinkedQueue;

/** Desktop harness: real GameServer + Json, engine bridged to Node. Mirrors HostingService.step(). */
public class JvmHost implements GameServer.Host {
    final ConcurrentLinkedQueue<String> events = new ConcurrentLinkedQueue<String>();
    final Path web; volatile boolean ready; GameServer server;
    JvmHost(Path web) { this.web = web; }
    public byte[] asset(String p) throws IOException { return Files.readAllBytes(web.resolve(p)); }
    public String invite(String h, boolean local) { return "{\"ok\":true,\"urls\":[\"http://" + h + "/\"],\"qr\":null}"; }
    public boolean ready() { return ready; }
    public void open(String c) { events.add("[\"o\"," + q(c) + "]"); }
    public void text(String c, String t) { events.add("[\"m\"," + q(c) + "," + q(t) + "]"); }
    public void closed(String c) { events.add("[\"c\"," + q(c) + "]"); }
    static String q(String s) { try { java.lang.reflect.Method m = Class.forName("com.dhakkamukki.local.Json").getDeclaredMethod("quote", CharSequence.class); m.setAccessible(true); return (String) m.invoke(null, s); } catch (Exception e) { throw new RuntimeException(e); } }
    static String uq(String s) { try { java.lang.reflect.Method m = Class.forName("com.dhakkamukki.local.Json").getDeclaredMethod("unquote", String.class); m.setAccessible(true); return (String) m.invoke(null, s); } catch (Exception e) { throw new RuntimeException(e); } }

    public static void main(String[] a) throws Exception {
        int port = Integer.parseInt(a[0]); Path root = Paths.get(a[1]);
        JvmHost h = new JvmHost(root.resolve("android/assets/web"));
        Process node = new ProcessBuilder("node", root.resolve("test/jvm/engine-bridge.js").toString()).start();
        BufferedReader err = new BufferedReader(new InputStreamReader(node.getErrorStream(), StandardCharsets.UTF_8));
        String tok = err.readLine();
        if (tok == null || !tok.startsWith("TOKEN ")) throw new IllegalStateException("engine did not start: " + tok);
        Files.write(Paths.get(a[2]), tok.substring(6).getBytes(StandardCharsets.UTF_8));
        h.server = new GameServer(port, h); h.server.start(); h.ready = true;
        System.out.println("JVM GameServer on " + port);
        Writer w = new OutputStreamWriter(node.getOutputStream(), StandardCharsets.UTF_8);
        BufferedReader r = new BufferedReader(new InputStreamReader(node.getInputStream(), StandardCharsets.UTF_8));
        long last = System.currentTimeMillis();
        while (true) {
            long now = System.currentTimeMillis(); long ms = Math.min(250, now - last); last = now;
            StringBuilder b = new StringBuilder("["); String ev; int n = 0;
            while ((ev = h.events.poll()) != null) { if (n++ > 0) b.append(','); b.append(ev); }
            b.append(']');
            w.write(q(b.toString()) + "\t" + ms + "\n"); w.flush();
            String out = uq(r.readLine());
            if (out != null) {
                int start = 0;
                while (start < out.length()) { int nl = out.indexOf('\n', start); if (nl < 0) nl = out.length(); int tab = out.indexOf('\t', start); if (tab > start && tab < nl) h.server.dispatch(out.substring(start, tab), out.substring(tab + 1, nl)); start = nl + 1; }
            }
            long sleep = 33 - (System.currentTimeMillis() - now); if (sleep > 0) Thread.sleep(sleep);
        }
    }
}
