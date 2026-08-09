import { Router, type IRouter } from "express";
import healthRouter from "./health";
import grokRouter from "./grok";
import executiveRouter from "./executive";
import debugRouter from "./debug";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grokRouter);
router.use(executiveRouter);
router.use(debugRouter);

export default router;
