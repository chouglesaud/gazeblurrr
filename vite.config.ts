import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Builds only the two screens people see (toolbar popup + settings page).
// The background, content and detector scripts stay plain JS in src/ — content
// scripts can't be ES modules, and they need no build step.
export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/unpacked/ui",
    emptyOutDir: true,
    modulePreload: false, // extension pages allow no inline scripts
    target: "chrome116",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "ui/popup.html"),
        options: resolve(__dirname, "ui/options.html"),
      },
    },
  },
});
