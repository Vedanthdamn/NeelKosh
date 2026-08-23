import express from "express";
import cors from "cors";
import { config } from "./config";
import { prisma } from "./db";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`NeelKosh backend listening on :${config.port}`);
});
