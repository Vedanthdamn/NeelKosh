import express from "express";
import cors from "cors";
import { config } from "./config";
import { prisma } from "./db";
import { projectsRouter } from "./routes/projects";
import { mrvRouter } from "./routes/mrv";
import { creditsRouter } from "./routes/credits";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", network: config.network });
});

app.use("/api/projects", projectsRouter);
app.use("/api/mrv", mrvRouter);
app.use("/api/credits", creditsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`NeelKosh backend listening on :${config.port} (network: ${config.network})`);
});
