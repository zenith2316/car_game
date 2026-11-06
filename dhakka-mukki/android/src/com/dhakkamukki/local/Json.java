package com.dhakkamukki.local;

/** Minimal JSON string helpers so the server stays free of Android-only classes. */
final class Json {
    private Json() { }

    static String quote(CharSequence s) {
        StringBuilder b = new StringBuilder(s.length() + 16);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\b': b.append("\\b"); break;
                case '\f': b.append("\\f"); break;
                default:
                    // U+2028 and U+2029 are escaped so the string is also a safe JavaScript literal.
                    if (c < 0x20 || c == 0x2028 || c == 0x2029 || c == '<') b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    /** Decode a JSON string literal (as returned by WebView.evaluateJavascript). Returns null if it is not a string. */
    static String unquote(String v) {
        if (v == null || v.length() < 2 || v.charAt(0) != '"' || v.charAt(v.length() - 1) != '"') return null;
        StringBuilder b = new StringBuilder(v.length());
        for (int i = 1; i < v.length() - 1; i++) {
            char c = v.charAt(i);
            if (c != '\\') { b.append(c); continue; }
            if (++i >= v.length() - 1) return null;
            char e = v.charAt(i);
            switch (e) {
                case '"': b.append('"'); break;
                case '\\': b.append('\\'); break;
                case '/': b.append('/'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'n': b.append('\n'); break;
                case 'r': b.append('\r'); break;
                case 't': b.append('\t'); break;
                case 'u':
                    if (i + 4 >= v.length()) return null;
                    try { b.append((char) Integer.parseInt(v.substring(i + 1, i + 5), 16)); } catch (NumberFormatException x) { return null; }
                    i += 4; break;
                default: return null;
            }
        }
        return b.toString();
    }
}
