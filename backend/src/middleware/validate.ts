import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

/** Parses req.body against a schema, replacing it with the parsed value, or responds 400. */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "ValidationError", issues: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}
