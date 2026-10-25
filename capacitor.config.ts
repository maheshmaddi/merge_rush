import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mergerush.app',
  appName: 'Merge Rush',
  webDir: 'dist',
  backgroundColor: '#070a1f',
  android: {
    // Game assets are bundled; no mixed content or remote debugging in release.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#070a1f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#070a1f',
      overlaysWebView: false,
    },
  },
};

export default config;
