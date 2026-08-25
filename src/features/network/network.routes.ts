import { Router } from "express";
import { NetworkController } from "./network.controller";
import { NetworkValidation } from "./network.validation";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { validate } from "../../common/middlewares/validate.middleware";

const router = Router();

// Protect all network routes with authentication
router.use(authenticate);

// --- Directory & profiles ----------------------------------------------------
router.get("/directory", NetworkController.searchDirectory);
router.get("/stats", NetworkController.getNetworkStats);
router.get("/suggestions", NetworkController.getSuggestions);

// "/me" is declared before "/profile/:userId" so it isn't captured as an id.
router.get("/me/profile", NetworkController.getMyProfile);
router.patch(
  "/me/profile",
  validate(NetworkValidation.updateMyProfile),
  NetworkController.updateMyProfile
);

router.get("/profile/:userId", NetworkController.getPublicProfile);

// --- Invitations -------------------------------------------------------------
router.get("/invitations/received", NetworkController.getReceivedInvites);
router.get("/invitations/sent", NetworkController.getSentInvites);
router.post("/invitations", validate(NetworkValidation.sendInvite), NetworkController.sendInvite);
router.post("/invitations/:connectionId/accept", NetworkController.acceptInvite);
router.post("/invitations/:connectionId/ignore", NetworkController.ignoreInvite);
router.delete("/invitations/:connectionId", NetworkController.withdrawInvite);

// --- Connections -------------------------------------------------------------
router.get("/connections", NetworkController.getConnections);
router.delete("/connections/:userId", NetworkController.removeConnection);

// --- Follows -----------------------------------------------------------------
router.post("/follow/:userId", NetworkController.followUser);
router.delete("/follow/:userId", NetworkController.unfollowUser);
router.get("/followers/:userId", NetworkController.getFollowers);
router.get("/following/:userId", NetworkController.getFollowing);

export default router;
