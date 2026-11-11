package cxs.kingofthebridge.port;

import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NativeSave")
public class NativeSavePlugin extends Plugin {
    private static final String SAVE_NAME = "save.json";

    private File mediaFile() throws Exception {
        File[] dirs = getContext().getExternalMediaDirs();
        for (File dir : dirs) {
            if (dir != null) {
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Media folder is unavailable");
                return new File(dir, SAVE_NAME);
            }
        }
        throw new Exception("Android media storage is unavailable; internal save is retained");
    }

    private void atomicWrite(File file, byte[] bytes) throws Exception {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream stream = null;
        try {
            stream = atomic.startWrite();
            stream.write(bytes);
            atomic.finishWrite(stream);
        } catch (Exception error) {
            if (stream != null) atomic.failWrite(stream);
            throw error;
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("Missing JSON save"); return; }
        try {
            JSONObject json = new JSONObject(data);
            byte[] bytes = (json.toString(2) + "\n").getBytes(StandardCharsets.UTF_8);
            File internal = new File(getContext().getFilesDir(), SAVE_NAME);
            // Keep the primary save even if removable/external media is unavailable.
            atomicWrite(internal, bytes);
            File media = mediaFile();
            atomicWrite(media, bytes);
            JSObject result = new JSObject();
            result.put("internalPath", internal.getAbsolutePath());
            result.put("mediaPath", media.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not write save: " + error.getMessage(), error); }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            File internal = new File(getContext().getFilesDir(), SAVE_NAME);
            File source = internal;
            try {
                File media = mediaFile();
                if (media.exists() && (!internal.exists() || media.lastModified() > internal.lastModified())) source = media;
            } catch (Exception ignored) { /* Internal saves work without external storage. */ }
            JSObject result = new JSObject();
            if (!source.exists()) { result.put("data", JSONObject.NULL); call.resolve(result); return; }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (FileInputStream input = new FileInputStream(source)) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            }
            String data = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            new JSONObject(data); // Do not accept corrupt edits or overwrite the primary save.
            if (!source.equals(internal)) atomicWrite(internal, data.getBytes(StandardCharsets.UTF_8));
            result.put("data", data);
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read JSON save: " + error.getMessage(), error); }
    }
}