import { Role } from "../../common/enums/role.enum";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { MembershipRepository } from "./membership.repository";
import {
  DEFAULT_MEMBERSHIP_PLANS,
  DEFAULT_RECRUITER_MEMBERSHIP_PLANS,
  MEMBERSHIP_MESSAGES,
  PLAN_LEVELS,
} from "./membership.constants";
import { Types } from "mongoose";
import { Job, Payment, Subscription, User } from "../../database/models";
import { EmailService } from "../../common/services/email.service";

export class MembershipService {
  /**
   * Helper: Expire all subscriptions that have passed their endDate
   */
  static async expireOverdueSubscriptions(userId?: string): Promise<void> {
    const filter: any = {
      status: "ACTIVE",
      endDate: { $lte: new Date() },
    };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    await Subscription.updateMany(filter, {
      $set: { status: "EXPIRED" },
    });
  }

  /**
   * Auto-seed default Job Seeker and Recruiter plans if none exist in DB
   */
  static async seedDefaultMemberships(): Promise<void> {
    try {
      const seekerPlansCount = await MembershipRepository.findActiveMemberships(Role.JOB_SEEKER);
      if (seekerPlansCount.length === 0) {
        await MembershipRepository.insertDefaultMemberships(DEFAULT_MEMBERSHIP_PLANS);
        console.log("✅ Default Job Seeker Membership plans seeded successfully.");
      }

      const recruiterPlansCount = await MembershipRepository.findActiveMemberships(Role.RECRUITER);
      if (recruiterPlansCount.length === 0) {
        await MembershipRepository.insertDefaultMemberships(DEFAULT_RECRUITER_MEMBERSHIP_PLANS);
        console.log("✅ Default Recruiter Membership plans seeded successfully.");
      }
    } catch (error) {
      console.error("⚠️ Failed to seed default membership plans:", error);
    }
  }

  /**
   * Get all active membership plans by role
   */
  static async getActiveMemberships(role: Role = Role.JOB_SEEKER) {
    const plans = await MembershipRepository.findActiveMemberships(role);
    return plans;
  }

  /**
   * Calculate Prorated Upgrade breakdown for user
   */
  static async calculateProratedUpgrade(userId: string, userRole: Role, newMembershipId: string) {
    const newPlan = await MembershipRepository.findMembershipById(newMembershipId);

    if (!newPlan || !newPlan.isActive) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        MEMBERSHIP_MESSAGES.MEMBERSHIP_NOT_FOUND
      );
    }

    if (newPlan.role !== userRole) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Cannot subscribe to ${newPlan.role} membership plan with ${userRole} account.`
      );
    }

    await this.expireOverdueSubscriptions(userId);

    const currentSub = await MembershipRepository.findActiveSubscription(userId);
    const roleLevels = PLAN_LEVELS[userRole] || {};
    const newPlanLevel = roleLevels[newPlan.name] || 1;

    if (!currentSub) {
      return {
        isUpgrade: false,
        currentSub: null,
        newPlan,
        unusedCredit: 0,
        finalUpgradePrice: newPlan.price,
        currency: newPlan.currency || "INR",
      };
    }

    const currentPlanName = currentSub.planName || (currentSub.membershipId as any)?.name || "";
    const currentPlanLevel = roleLevels[currentPlanName] || 1;

    if (currentPlanLevel === newPlanLevel) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        MEMBERSHIP_MESSAGES.SAME_PLAN_ACTIVE
      );
    }

    if (currentPlanLevel > newPlanLevel) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        MEMBERSHIP_MESSAGES.HIGHER_PLAN_ACTIVE
      );
    }

    // Calculate remaining days & prorated credit
    const now = new Date();
    const remainingMs = currentSub.endDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    const oldDailyPrice = (currentSub.amount || 0) / 30;
    const unusedCredit = Math.round(oldDailyPrice * remainingDays);

    const rawUpgradePrice = newPlan.price - unusedCredit;
    const finalUpgradePrice = Math.max(0, Math.round(rawUpgradePrice));

    return {
      isUpgrade: true,
      currentSub,
      currentPlanName,
      newPlan,
      remainingDays,
      unusedCredit,
      finalUpgradePrice,
      currency: newPlan.currency || "INR",
    };
  }

  /**
   * Get current subscription for logged-in Job Seeker
   */
  static async getCurrentSubscription(userId: string) {
    await this.expireOverdueSubscriptions(userId);
    let subscription = await MembershipRepository.findActiveSubscription(userId);

    if (!subscription) {
      const freePlan = await MembershipRepository.findActiveMemberships(Role.JOB_SEEKER)
        .then((plans) => plans.find((p) => p.name === "Free") || plans[0]);

      return {
        hasActiveSubscription: false,
        subscription: null,
        plan: freePlan || null,
      };
    }

    return {
      hasActiveSubscription: true,
      subscription,
      plan: subscription.membershipId,
    };
  }

  /**
   * Get current subscription & job limit metrics for logged-in Recruiter
   */
  static async getCurrentRecruiterSubscription(userId: string) {
    await this.expireOverdueSubscriptions(userId);
    let subscription = await MembershipRepository.findActiveSubscription(userId);

    const activeJobsCount = await Job.countDocuments({
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
      status: "ACTIVE",
    });

    if (!subscription) {
      const freePlan = await MembershipRepository.findActiveMemberships(Role.RECRUITER)
        .then((plans) => plans.find((p) => p.name === "Free") || plans[0]);

      return {
        hasActiveSubscription: false,
        subscription: null,
        plan: freePlan || null,
        activeJobsCount,
        maxActiveJobs: 3,
        canPostJob: activeJobsCount < 3,
      };
    }

    const planName = (subscription.membershipId as any)?.name || subscription.planName;
    const isFreePlan = planName === "Free";
    const maxActiveJobs = isFreePlan ? 3 : Infinity;
    const canPostJob = !isFreePlan || activeJobsCount < 3;

    return {
      hasActiveSubscription: true,
      subscription,
      plan: subscription.membershipId,
      activeJobsCount,
      maxActiveJobs: maxActiveJobs === Infinity ? "Unlimited" : maxActiveJobs,
      canPostJob,
    };
  }

  /**
   * Subscribe user (Job Seeker or Recruiter) to a membership plan (Free or direct)
   */
  static async subscribe(userId: string, userRole: Role, membershipId: string) {
    const upgradeCalc = await this.calculateProratedUpgrade(userId, userRole, membershipId);
    const plan = upgradeCalc.newPlan;

    if (upgradeCalc.isUpgrade && upgradeCalc.currentSub) {
      // Mark old active subscription as REPLACED upon upgrade
      await Subscription.findByIdAndUpdate(upgradeCalc.currentSub._id, {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledReason: `Upgraded to ${plan.name}`,
          autoRenew: false,
        },
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationInDays * 24 * 60 * 60 * 1000);

    const isFreePlan = plan.price === 0;

    const newSubscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: upgradeCalc.finalUpgradePrice,
      currency: plan.currency || "INR",
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: "ACTIVE",
      autoRenew: true,
    });

    await Payment.create({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      subscriptionId: newSubscription._id,
      amount: upgradeCalc.finalUpgradePrice,
      currency: plan.currency || "INR",
      status: "SUCCESS",
      provider: isFreePlan ? "MANUAL" : "RAZORPAY",
      providerOrderId: `order_${newSubscription._id.toString()}_${Date.now()}`,
      paidAt: new Date(),
    }).catch(() => null);

    return {
      message: MEMBERSHIP_MESSAGES.SUBSCRIPTION_SUCCESS,
      subscription: newSubscription,
    };
  }

  /**
   * Check if recruiter reached job posting limit
   */
  static async verifyJobPostingLimit(userId: string) {
    const currentRecSub = await this.getCurrentRecruiterSubscription(userId);
    if (!currentRecSub.canPostJob) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        MEMBERSHIP_MESSAGES.JOB_POST_LIMIT_EXCEEDED
      );
    }
  }

  /**
   * Cancel active subscription
   */
  static async cancelSubscription(userId: string) {
    await this.expireOverdueSubscriptions(userId);
    const activeSub = await MembershipRepository.findActiveSubscription(userId);

    if (!activeSub) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        MEMBERSHIP_MESSAGES.NO_ACTIVE_SUBSCRIPTION
      );
    }

    const cancelledSub = await MembershipRepository.cancelSubscription((activeSub._id as any).toString());

    return {
      message: MEMBERSHIP_MESSAGES.CANCEL_SUCCESS,
      subscription: cancelledSub,
    };
  }

  /**
   * Get subscription history
   */
  static async getSubscriptionHistory(userId: string) {
    const history = await MembershipRepository.findSubscriptionHistory(userId);
    return history;
  }

  /**
   * Check for subscriptions expiring in 3 days and dispatch renewal reminder emails
   */
  static async checkExpiringSubscriptionsAndNotify(): Promise<void> {
    try {
      await this.expireOverdueSubscriptions();
      const now = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + 3);

      const expiringSubscriptions = await Subscription.find({
        status: "ACTIVE",
        endDate: { $gte: now, $lte: threeDaysFromNow },
      }).populate("userId", "email role");

      for (const sub of expiringSubscriptions) {
        const user = sub.userId as any;
        if (user && user.email) {
          const diffMs = new Date(sub.endDate).getTime() - now.getTime();
          const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

          EmailService.sendSubscriptionRenewalReminder({
            email: user.email,
            name: user.email.split("@")[0],
            planName: sub.planName,
            expiryDate: sub.endDate,
            daysRemaining,
          }).catch((err) => console.error(`[MembershipService] Failed to send renewal email to ${user.email}:`, err));
        }
      }
    } catch (error) {
      console.error("[MembershipService] Error checking expiring subscriptions:", error);
    }
  }
}
