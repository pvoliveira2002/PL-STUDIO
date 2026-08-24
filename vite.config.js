import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // O Electron carrega o build pelo protocolo file://. Os assets precisam ser
  // relativos ao index.html em vez de apontarem para /assets na raiz do disco.
  base: './',
});
