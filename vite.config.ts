import { defineConfig } from "vite";

// glTF binaries are assets (so `?inline` embeds them as data URLs for the offline player).
export default defineConfig({
  assetsInclude: ["**/*.glb"],
  // Only the player is built here. Pages (pages/<name>/) are served by the dev server as they are, and exported on
  // their own with tools/export-page.mjs — adding them as inputs here would split a shared chunk out of the player
  // and break its single-file offline build (and every render tool that uses it).
  build: { target: "es2022" },
});
