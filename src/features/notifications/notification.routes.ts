import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", NotificationController.getNotifications);
router.patch("/read-all", NotificationController.markAllAsRead);
router.delete("/clear-all", NotificationController.clearAll);
router.patch("/:id/read", NotificationController.markAsRead);
router.delete("/:id", NotificationController.deleteNotification);

export default router;
