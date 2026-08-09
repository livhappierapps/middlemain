import { Router, type IRouter } from "express";
import healthRouter from "./health";
import grokRouter from "./grok";
import executiveRouter from "./executive";
import debugRouter from "./debug";
import { councilRoomRouter } from "./councilRoom";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grokRouter);
router.use(executiveRouter);
router.use(debugRouter);
router.use(councilRoomRouter);

export default router;
