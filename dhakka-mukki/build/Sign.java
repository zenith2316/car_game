import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** sign <in.apk> <out.apk> <keystore.p12> <alias> <password>   |   verify <apk> */
public class Sign {
    public static void main(String[] a) throws Exception {
        if (a[0].equals("verify")) {
            ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[1])).build().verify();
            System.out.println("verified=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme() + " v2=" + r.isVerifiedUsingV2Scheme());
            for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
            if (!r.isVerified()) System.exit(1);
            return;
        }
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[3])) { ks.load(in, a[5].toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(a[4], a[5].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[4]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder(a[4], key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc)).setInputApk(new File(a[1])).setOutputApk(new File(a[2]))
            .setMinSdkVersion(26).setV1SigningEnabled(false).setV2SigningEnabled(true).build().sign();
        System.out.println("signed " + a[2]);
    }
}
