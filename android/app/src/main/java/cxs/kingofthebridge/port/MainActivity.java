package cxs.kingofthebridge.port;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSavePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
