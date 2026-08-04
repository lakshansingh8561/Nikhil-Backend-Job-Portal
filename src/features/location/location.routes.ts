import { Router } from "express";
import { LocationController } from "./location.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";

const router = Router();

// Protect location endpoints with JWT auth
router.use(authenticate);

router.post("/update", LocationController.updateLocation);
router.get("/me", LocationController.getLocation);

export default router;
