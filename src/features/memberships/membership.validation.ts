import { z } from "zod";

export const subscribeSchema = z.object({
  membershipId: z.string().min(1, "Membership ID is required"),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
});
