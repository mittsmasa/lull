import { Hono } from "hono";

const app = new Hono().get("/", (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
});

export { app as healthRoute };
