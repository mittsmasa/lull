import { Hono } from "hono";
import { healthRoute } from "./routes/health";

const app = new Hono().basePath("/api");

const routes = app.route("/health", healthRoute);

export type AppType = typeof routes;
export default app;
