/// <reference types="vite-plus/client" />
import { defineHandler } from "void";
import logo from "../src/assets/logo.svg?raw";

// Serve the logo before the catch-all page route handles /logo.svg.
export const GET = defineHandler((c) => {
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(logo);
});
