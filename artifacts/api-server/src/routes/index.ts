import { Router, type IRouter } from "express";
import healthRouter from "./health";
import grokRouter from "./grok";
import executiveRouter from "./executive";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grokRouter);
router.use(executiveRouter);

export default router;
