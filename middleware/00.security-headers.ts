import { defineMiddleware } from "void";

export default defineMiddleware(async (c, next) => {
  await next();

  const headers = new Headers(c.res.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  headers.set("X-Frame-Options", "DENY");

  c.res = new Response(c.res.body, {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
});
