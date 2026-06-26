import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Проксі: усі запити фронтенду на /api перенаправляються на Express (порт 3000),
// щоб не було проблем з CORS у dev-режимі.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
