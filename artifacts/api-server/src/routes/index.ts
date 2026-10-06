import { Router, type IRouter } from "express";
import healthRouter from "./";
import grokRouter from "./";
import executiveRouter from "./";
import debugRouter from "./";
import debugRepoRouter from "./";
import { councilRoomRouter } from "./";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grokRouter);
router.use(executiveRouter);
router.use(debugRouter);
router.use(debugRepoRouter);
router.use(councilRoomRouter);

export default router;
