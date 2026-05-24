import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { healthRoute } from "./routes/health";

const app = new Hono().basePath("/api");

app.use(
  "/auth/*",
  cors({
    origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

const routes = app.route("/health", healthRoute);

export type AppType = typeof routes;
export default app;
