import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [
    react({
      babel: {
        plugins: [
          ["babel-plugin-react-compiler", { target: "19" }],
        ],
      },
    }),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/c-[hash:8].js",
        chunkFileNames: "assets/c-[hash:8].js",
        manualChunks: {
          monaco: ["monaco-editor", "@monaco-editor/react"],
        },
        assetFileNames: (assetInfo) => {
          const ext = assetInfo.name?.split(".").pop()?.toLowerCase();

          if (["avif", "png", "jpg", "jpeg", "webp", "gif", "svg"].indexOf(ext ?? "") !== -1) {
            return "assets/a-[hash:8][extname]";
          }
          if (ext === "css") {
            return "assets/s-[hash:8][extname]";
          }
          return "assets/f-[hash:8][extname]";
        },
      },
    },
  },
  esbuild: command === "build" ? {
    drop: ["console" as "console"],
  } : undefined,
  resolve: {
    alias: {
      "@": decodeURIComponent(new URL("./src", import.meta.url).pathname),
    },
  },
  
  clearScreen: command === "serve" ? false : true,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
