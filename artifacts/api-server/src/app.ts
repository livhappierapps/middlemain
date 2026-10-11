import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { checkExecutiveKey, createRateLimiter } from "./lib/security";

const app: Express = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "400kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/debug", createRateLimiter(12));
const requireOwner: import("express").RequestHandler = (req, res, next) => {
  if (!checkExecutiveKey(req, res)) return;
  next();
};
app.use("/api/grok/chat", requireOwner, createRateLimiter(20));
app.use("/api/executive", requireOwner, createRateLimiter(60));
const roomCreationLimiter = createRateLimiter(10);
app.use("/api/council/rooms", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") {
    roomCreationLimiter(req, res, next);
    return;
  }
  next();
});
app.use("/api", router);
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) { res.end(); return; }
  const status = error.type === "entity.too.large" ? 413 :
    error instanceof SyntaxError || error.status === 400 ? 400 : 500;
  logger.warn({ status }, "Request rejected");
  res.status(status).json({ error: status === 413 ? "Request too large" : status === 400 ? "Malformed request" : "Request failed" });
};
app.use(errorHandler);

export default app;
