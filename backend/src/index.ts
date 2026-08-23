import express from "express";
import cors from "cors";
import { config } from "./config";
import { prisma } from "./db";
import { projectsRouter } from "./routes/projects";
import { mrvRouter } from "./routes/mrv";
import { creditsRouter } from "./routes/credits";
import { marketplaceRouter } from "./routes/marketplace";
import { authRouter } from "./routes/auth";
import { errorHandler } from "./middleware/errorHandler";
import { attachUser } from "./middleware/auth";
import { startEventSync } from "./services/eventSync";

const app = express();
app.use(cors());
app.use(express.json());
// Decodes a bearer token if present, on every request. Doesn't reject anything by itself — most
// of this API is intentionally open; requireAuth/requireRole gate the specific routes that need it.
app.use(attachUser);

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", network: config.network });
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/mrv", mrvRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/marketplace", marketplaceRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`NeelKosh backend listening on :${config.port} (network: ${config.network})`);

  // Sync runs alongside the API rather than blocking startup: a chain that's slow or briefly
  // unreachable shouldn't stop the server from serving already-cached data.
  startEventSync().catch((error) => {
    console.error("[event-sync] failed to start:", error);
  });
});
