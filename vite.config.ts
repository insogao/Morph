import { defineConfig } from "vite";

// glTF binaries are assets (so `?inline` embeds them as data URLs for the offline player).
export default defineConfig({
  assetsInclude: ["**/*.glb"],
  build: { target: "es2022" },
});
