import { Router, type IRouter } from "express";
import healthRouter from "./health";
import grokRouter from "./grok";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grokRouter);

export default router;
