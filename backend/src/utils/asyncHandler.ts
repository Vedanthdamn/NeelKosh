import type { NextFunction, Request, Response } from "express";

/** Forwards a rejected promise to Express's error middleware instead of crashing the process. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
