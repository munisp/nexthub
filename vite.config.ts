import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },

  root: path.resolve(__dirname, "client"),

  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    minify: "esbuild",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
          if (id.includes("node_modules/@trpc/") || id.includes("node_modules/@tanstack/react-query")) return "vendor-trpc";
          if (id.includes("node_modules/@radix-ui/") || id.includes("node_modules/lucide-react") || id.includes("node_modules/clsx") || id.includes("node_modules/tailwind-merge")) return "vendor-ui";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) return "vendor-charts";
          if (id.includes("node_modules/qrcode") || id.includes("node_modules/jsqr")) return "vendor-qr";
          if (id.includes("node_modules/@tanstack/react-virtual")) return "vendor-virtual";
          if (id.includes("node_modules/date-fns") || id.includes("node_modules/dayjs")) return "vendor-date";
          if (id.includes("node_modules/")) return "vendor-misc";
          if (id.includes("/pages/nexthub/Settlement")) return "app-settlement";
          if (id.includes("/pages/nexthub/Participant") || id.includes("DFSPTopology")) return "app-participants";
          if (id.includes("/pages/nexthub/FX") || id.includes("/pages/nexthub/CBDC")) return "app-fx";
          if (id.includes("/pages/nexthub/AML") || id.includes("/pages/nexthub/Regulator") || id.includes("/pages/nexthub/Dispute")) return "app-compliance";
          if (id.includes("/pages/nexthub/NQR") || id.includes("NqrScanner") || id.includes("NqrGenerator")) return "app-nqr";
          if (id.includes("/pages/nexthub/Billing")) return "app-billing";
          if (id.includes("/pages/nexthub/Security") || id.includes("wave230")) return "app-security";
          if (id.includes("/pages/nexthub/Onboarding") || id.includes("wave221") || id.includes("wave223")) return "app-onboarding";
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "entry-[hash].js",
      },
      treeshake: { moduleSideEffects: false, propertyReadSideEffects: false },
    },
  },

  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/trpc": { target: "http://localhost:3001", changeOrigin: true },
    },
  },

  optimizeDeps: {
    include: ["react", "react-dom", "@trpc/client", "@trpc/react-query", "@tanstack/react-query", "lucide-react"],
    exclude: ["recharts", "@tanstack/react-virtual", "qrcode"],
  },
});
