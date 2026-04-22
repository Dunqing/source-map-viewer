import fs from "node:fs";
import { createRequire } from "node:module";
import { defineConfig, type Plugin, type ViteDevServer } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { voidPlugin } from "void";
import { voidVue } from "@void/vue/plugin";
import UnoCSS from "unocss/vite";
import Icons from "unplugin-icons/vite";

const isTest = process.env.VITEST === "true";

/**
 * Injects UnoCSS-generated styles into dev SSR HTML responses.
 *
 * Cloudflare's Vite plugin streams SSR responses via:
 *   res.writeHead(status, headers)
 *   for await (chunk of body) res.write(chunk)
 *   res.end()
 *
 * This plugin buffers HTML write() calls and injects UnoCSS styles
 * before flushing everything in end().
 */
function unocssDevSSRInject(): Plugin {
  let server: ViteDevServer;

  return {
    name: "unocss-dev-ssr-inject",
    configureServer(_server) {
      server = _server;
      const require_ = createRequire(import.meta.url);
      const resetPath = require_.resolve("@unocss/reset/tailwind.css");
      const resetCSS = fs.readFileSync(resetPath, "utf-8");

      server.middlewares.use((req, res, next) => {
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const originalWriteHead = res.writeHead.bind(res);
        const chunks: Buffer[] = [];
        let isHtml = false;
        let savedStatusCode: number | undefined;
        let savedHeaders: Record<string, string> = {};

        // Intercept writeHead to check content-type and defer if HTML
        res.writeHead = function (statusCode: number, headers?: any) {
          const h = typeof headers === "object" && !Array.isArray(headers) ? headers : {};
          const ct = h["content-type"] || h["Content-Type"] || res.getHeader("content-type") || "";
          isHtml = ct.toString().includes("text/html");

          if (isHtml) {
            savedStatusCode = statusCode;
            savedHeaders = h;
            return res;
          }
          // eslint-disable-next-line prefer-rest-params
          return originalWriteHead.apply(res, arguments as any);
        } as typeof res.writeHead;

        // Buffer HTML writes, pass through non-HTML
        res.write = function (chunk: any, encoding?: any, cb?: any) {
          if (isHtml && chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            return true;
          }
          return originalWrite(chunk, encoding, cb);
        } as typeof res.write;

        // On end: inject CSS into buffered HTML, then flush
        res.end = function (chunk?: any, encoding?: any, cb?: any) {
          if (!isHtml) {
            return originalEnd(chunk, encoding, cb);
          }
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          if (chunks.length === 0) {
            return originalEnd(chunk, encoding, cb);
          }

          const html = Buffer.concat(chunks).toString("utf-8");
          const unocssPlugin = server.config.plugins.find(
            (p: Plugin) => p.name === "unocss:api",
          ) as
            | (Plugin & { api?: { getContext: () => { uno: any; tokens: Set<string> } } })
            | undefined;

          if (!unocssPlugin?.api || !html.includes("</head>")) {
            originalWriteHead(savedStatusCode || 200, savedHeaders);
            return originalEnd(html, encoding, cb);
          }

          const { uno, tokens } = unocssPlugin.api.getContext();
          uno
            .generate(tokens)
            .then((result: { css: string }) => {
              let output = html;
              if (result.css) {
                const shareSlugHideRule = "html.has-share-slug #app{visibility:hidden}";
                output = html.replace(
                  "</head>",
                  `<style>${resetCSS}\n${shareSlugHideRule}\n${result.css}</style></head>`,
                );
              }
              savedHeaders["content-length"] = String(Buffer.byteLength(output));
              delete savedHeaders["transfer-encoding"];
              originalWriteHead(savedStatusCode || 200, savedHeaders);
              originalEnd(output, encoding, cb);
            })
            .catch(() => {
              originalWriteHead(savedStatusCode || 200, savedHeaders);
              originalEnd(html, encoding, cb);
            });
        } as typeof res.end;

        next();
      });
    },
  };
}

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    environment: "happy-dom",
  },
  plugins: [
    unocssDevSSRInject(),
    ...(isTest ? [vue()] : [voidPlugin(), voidVue()]),
    UnoCSS(),
    Icons({ compiler: "vue3", autoInstall: true }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    // Inline the modulepreload helper to avoid Cloudflare asset hash
    // collision — Vite's preload-helper chunk is identical across all
    // projects, causing a corroboration failure in the global store.
    modulePreload: { polyfill: false },
  },
});
