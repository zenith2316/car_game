package com.dhakkamukki.local;

import java.net.URI;

/** The host WebView may only navigate to the local server. */
final class LocalOrigin {
    private LocalOrigin() { }

    static boolean allows(String url, int port) {
        try {
            URI u = new URI(url);
            return "http".equals(u.getScheme()) && "127.0.0.1".equals(u.getHost()) && u.getPort() == port && u.getRawUserInfo() == null;
        } catch (Exception e) {
            return false;
        }
    }
}
