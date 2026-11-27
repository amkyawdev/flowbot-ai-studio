import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.amkyaw.flowbot',
  appName: 'FlowBot AI Studio',
  webDir: 'dist',
  backgroundColor: '#060608',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#060608',
    },
  },
};

export default config;