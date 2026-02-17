console.log("=== SERVER STARTING ===");
console.log(`Node.js ${process.version} | Platform: ${process.platform} | Arch: ${process.arch}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
console.log(`PORT: ${process.env.PORT || "not set (will default to 5000)"}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set (" + process.env.DATABASE_URL.substring(0, 20) + "...)" : "NOT SET"}`);

import dotenv from "dotenv";
dotenv.config({ override: true });

console.log("[startup] dotenv loaded, importing express...");

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

console.log("[startup] All imports loaded successfully");

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("[startup] Registering routes...");
    await registerRoutes(httpServer, app);
    console.log("[startup] Routes registered successfully");

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    if (process.env.NODE_ENV === "production") {
      console.log("[startup] Production mode: serving static files...");
      serveStatic(app);
    } else {
      console.log("[startup] Development mode: setting up Vite...");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    const port = parseInt(process.env.PORT || "5000", 10);
    const host = process.env.HOST || "0.0.0.0";
    console.log(`[startup] Attempting to listen on ${host}:${port}...`);
    httpServer.listen(
      { port, host },
      () => {
        log(`serving on port ${port}`);
        console.log(`=== SERVER READY on ${host}:${port} ===`);
      },
    );
  } catch (err: any) {
    console.error("=== SERVER STARTUP FAILED ===");
    console.error("Error name:", err?.name);
    console.error("Error message:", err?.message);
    console.error("Error stack:", err?.stack);
    process.exit(1);
  }
})();
