import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "0.0.0.0",
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key}",
        "**/.git/**",
        "**/.local/**", "**/.data/**", "**/backups/**", "**/*.sqlite*", "**/*.enc",
        "**/server/**",
        "**/test/**",
        "**/scripts/**",
      ],
    },
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
  preview: {
    host: "0.0.0.0",
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
