import { Role } from "../../common/enums/role.enum";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { MembershipRepository } from "./membership.repository";
import {
  DEFAULT_MEMBERSHIP_PLANS,
  DEFAULT_RECRUITER_MEMBERSHIP_PLANS,
  MEMBERSHIP_MESSAGES,
  PLAN_LEVELS,
  getPlanLevel,
} from "./membership.constants";
import { Types } from "mongoose";
import { Job, Payment, Subscription, Membership, User, IMembership, IMembershipPrice, BillingCycle } from "../../database/models";
import { EmailService } from "../../common/services/email.service";
import { PaymentProvider, SubscriptionStatus } from "../../common/enums";
import { env } from "../../config/env";

export class MembershipService {
  /**
   * Helper: Resolve price, currency, and duration for a given plan and billing cycle
   */
  static getPlanPriceDetails(plan: IMembership, billingCycle: BillingCycle = "monthly"): IMembershipPrice {
    if (plan.prices && plan.prices.length > 0) {
      const match = plan.prices.find((p) => p.billingCycle === billingCycle);
      if (match) return match;
    }

    // Fallback if no prices subdocument exists
    const isYearly = billingCycle === "yearly";
    const price = isYearly ? plan.price * 10 : plan.price;
    const durationInDays = isYearly ? 365 : (plan.durationInDays || 30);

    return {
      billingCycle,
      price,
      currency: plan.currency || "INR",
      durationInDays,
    };
  }

  /**
   * Calculate exact calendar subscription end date (1 month / 1 year from start date)
   */
  static calculateSubscriptionEndDate(startDate: Date, billingCycle: BillingCycle = "monthly"): Date {
    const endDate = new Date(startDate);
    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    return endDate;
  }

  /**
   * Helper: Expire all subscriptions that have passed their currentPeriodEnd / endDate
   */
  static async expireOverdueSubscriptions(userId?: string): Promise<void> {
    const filter: any = {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: { $lte: new Date() },
      isDeleted: { $ne: true },
    };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    await Subscription.updateMany(filter, {
      $set: { status: SubscriptionStatus.EXPIRED },
    });
  }

  /**
   * Auto-seed default Job Seeker and Recruiter plans if none exist in DB
   */
  static async seedDefaultMemberships(): Promise<void> {
    try {
      // Drop old unique index name_1_role_1 from MongoDB collection if present
      await Membership.collection.dropIndex("name_1_role_1").catch(() => {});

      const allPlans = [...DEFAULT_MEMBERSHIP_PLANS, ...DEFAULT_RECRUITER_MEMBERSHIP_PLANS];
      for (const defaultPlan of allPlans) {
        await Membership.updateOne(
          { name: defaultPlan.name, role: defaultPlan.role, currency: defaultPlan.currency },
          { $set: defaultPlan },
          { upsert: true }
        );
      }
      console.log("✅ Default Membership plans synced successfully.");
    } catch (error) {
      console.error("⚠️ Failed to seed default membership plans:", error);
    }
  }

  /**
   * Get all active membership plans by role, target currency (USD vs INR), & billing cycle (monthly vs yearly)
   */
  static async getActiveMemberships(
    role: Role = Role.JOB_SEEKER,
    targetCurrency: "USD" | "INR" = "USD",
    targetCycle: "monthly" | "yearly" = "monthly"
  ) {
    const cycle = targetCycle === "yearly" ? "yearly" : "monthly";

    const query: any = {
      role,
      isActive: true,
      isDeleted: { $ne: true },
      $or: [
        { billingCycle: cycle },
        { price: 0 },
        { name: "Free" },
      ],
    };

    const plans = await Membership.find(query).sort({ price: 1 });

    const result = plans
      .filter((planDoc) => {
        if (planDoc.price === 0 || planDoc.name === "Free") return true;

        const curr = planDoc.currency || "USD";
        if (targetCurrency === "INR") {
          return curr === "INR" || planDoc.prices?.some((p) => p.currency === "INR");
        } else {
          return curr === "USD" || curr === "$" || (!planDoc.currency && !planDoc.prices?.some((p) => p.currency === "INR"));
        }
      })
      .map((planDoc) => {
        const obj = planDoc.toObject();
        if (obj.price > 0 && obj.name !== "Free") {
          const priceDetails = MembershipService.getPlanPriceDetails(obj, cycle);
          obj.price = priceDetails.price;
          obj.durationInDays = priceDetails.durationInDays;
          obj.billingCycle = priceDetails.billingCycle;
          if (priceDetails.currency) obj.currency = priceDetails.currency;
        } else {
          obj.billingCycle = cycle;
        }
        return obj;
      });

    // Sort so Free plan (price === 0 or name === "Free") is ALWAYS 1st!
    result.sort((a, b) => {
      const aIsFree = a.price === 0 || a.name === "Free";
      const bIsFree = b.price === 0 || b.name === "Free";
      if (aIsFree && !bIsFree) return -1;
      if (!aIsFree && bIsFree) return 1;
      return a.price - b.price;
    });

    return result;
  }

  /**
   * Admin: Get all membership plans (active & inactive)
   */
  static async getAllAdminMemberships() {
    const plans = await Membership.find({ isDeleted: { $ne: true } }).sort({ role: 1, price: 1 });
    return plans;
  }

  /**
   * Admin: Create a new membership plan
   */
  static async createMembershipPlan(data: Partial<IMembership>) {
    if (!data.name || !data.role) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Plan name and role are required.");
    }

    const selectedCurrency = data.currency || "USD";
    const planPrice = Number(data.price || 0);
    const nameLower = (data.name || "").toLowerCase();
    const cycle: BillingCycle = data.billingCycle || (nameLower.includes("yearly") || nameLower.includes("annual") || (data.durationInDays && Number(data.durationInDays) >= 365) ? "yearly" : "monthly");
    const durationInDays = Number(data.durationInDays || (cycle === "yearly" ? 365 : 30));

    const prices: IMembershipPrice[] = [
      {
        billingCycle: cycle,
        price: planPrice,
        currency: selectedCurrency,
        durationInDays,
        providerPriceIds: data.planId
          ? [{ provider: PaymentProvider.RAZORPAY, providerPlanId: data.planId }]
          : [],
      },
    ];

    const newPlan = await Membership.create({
      ...data,
      billingCycle: cycle,
      price: planPrice,
      currency: selectedCurrency,
      planId: data.planId || "",
      durationInDays,
      prices,
      isActive: data.isActive !== false,
      isDeleted: false,
    });

    return newPlan;
  }

  /**
   * Admin: Update existing membership plan
   */
  static async updateMembershipPlan(id: string, data: Partial<IMembership>) {
    const plan = await Membership.findById(id);
    if (!plan || plan.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Membership plan not found.");
    }

    const selectedCurrency = data.currency || plan.currency || "USD";
    const planPrice = data.price !== undefined ? Number(data.price) : plan.price;
    const nameLower = (data.name || plan.name || "").toLowerCase();
    const cycle: BillingCycle = data.billingCycle || plan.billingCycle || (nameLower.includes("yearly") || nameLower.includes("annual") || (data.durationInDays && Number(data.durationInDays) >= 365) ? "yearly" : "monthly");
    const durationInDays = data.durationInDays !== undefined
      ? Number(data.durationInDays)
      : (plan.durationInDays || (cycle === "yearly" ? 365 : 30));

    const prices: IMembershipPrice[] = [
      {
        billingCycle: cycle,
        price: planPrice,
        currency: selectedCurrency,
        durationInDays,
        providerPriceIds: (data.planId || plan.planId)
          ? [{ provider: PaymentProvider.RAZORPAY, providerPlanId: data.planId || plan.planId || "" }]
          : [],
      },
    ];

    Object.assign(plan, {
      ...data,
      billingCycle: cycle,
      price: planPrice,
      currency: selectedCurrency,
      planId: data.planId !== undefined ? data.planId : plan.planId,
      durationInDays,
      prices,
    });

    await plan.save();
    return plan;
  }

  /**
   * Admin: Toggle Active/Inactive status
   */
  static async toggleMembershipStatus(id: string) {
    const plan = await Membership.findById(id);
    if (!plan || plan.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Membership plan not found.");
    }

    plan.isActive = !plan.isActive;
    await plan.save();
    return plan;
  }

  /**
   * Admin: Soft-delete membership plan
   */
  static async deleteMembershipPlan(id: string) {
    const plan = await Membership.findById(id);
    if (!plan || plan.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Membership plan not found.");
    }

    plan.isDeleted = true;
    plan.deletedAt = new Date();
    plan.isActive = false;
    await plan.save();
    return { message: "Membership plan deleted successfully." };
  }

  /**
   * Calculate Prorated Upgrade breakdown for user
   */
  static async calculateProratedUpgrade(
    userId: string,
    userRole: Role,
    newMembershipId: string,
    billingCycle: BillingCycle = "monthly"
  ) {
    const newPlan = await MembershipRepository.findMembershipById(newMembershipId);

    if (!newPlan || !newPlan.isActive || newPlan.isDeleted) {
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

    const priceDetails = this.getPlanPriceDetails(newPlan, billingCycle);

    const currentSub = await MembershipRepository.findActiveSubscription(userId);
    const newPlanLevel = getPlanLevel(userRole, newPlan.name);

    if (!currentSub) {
      return {
        isUpgrade: false,
        currentSub: null,
        newPlan,
        billingCycle,
        priceDetails,
        unusedCredit: 0,
        finalUpgradePrice: priceDetails.price,
        currency: priceDetails.currency,
      };
    }

    const currentPlanName = currentSub.planName || (currentSub.membershipId as any)?.name || "";
    const currentPlanLevel = getPlanLevel(userRole, currentPlanName);

    const currentSubCycle = currentSub.billingCycle ||
      (currentSub.membershipId as any)?.billingCycle ||
      (currentPlanName.toLowerCase().includes("yearly") ? "yearly" : "monthly");

    const targetCycle = billingCycle ||
      newPlan.billingCycle ||
      (newPlan.name.toLowerCase().includes("yearly") ? "yearly" : "monthly");

    if (currentPlanLevel === newPlanLevel) {
      if (currentSubCycle === targetCycle && !currentSub.cancelAtPeriodEnd) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          MEMBERSHIP_MESSAGES.SAME_PLAN_ACTIVE
        );
      }
      if (currentSubCycle === "yearly" && targetCycle === "monthly") {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          MEMBERSHIP_MESSAGES.HIGHER_PLAN_ACTIVE
        );
      }
    }

    if (currentPlanLevel > newPlanLevel) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        MEMBERSHIP_MESSAGES.HIGHER_PLAN_ACTIVE
      );
    }

    // Calculate remaining days & prorated credit
    const now = new Date();
    const subEnd = currentSub.currentPeriodEnd || currentSub.endDate;
    const remainingMs = subEnd.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    const currentSubCycleDuration = currentSub.billingCycle === "yearly" ? 365 : 30;
    const oldDailyPrice = (currentSub.amount || 0) / currentSubCycleDuration;
    const unusedCredit = Math.round(oldDailyPrice * remainingDays);

    const rawUpgradePrice = priceDetails.price - unusedCredit;
    const finalUpgradePrice = Math.max(0, Math.round(rawUpgradePrice));

    return {
      isUpgrade: true,
      currentSub,
      currentPlanName,
      newPlan,
      billingCycle,
      priceDetails,
      remainingDays,
      unusedCredit,
      finalUpgradePrice,
      currency: priceDetails.currency,
    };
  }

  /**
   * Get current subscription for logged-in Job Seeker
   */
  static async getCurrentSubscription(userId: string) {
    await this.expireOverdueSubscriptions(userId);
    let subscription = await MembershipRepository.findActiveSubscription(userId);

    // Fallback: If DB subscription is missing or inactive, sync with Polar Sandbox API
    if (!subscription && env.POLAR_ACCESS_TOKEN) {
      try {
        const { PolarService } = await import("../payments/polar.service");
        const user = await User.findById(userId);
        const polar = PolarService.getPolarInstance();
        const subsList = await polar.subscriptions.list({ limit: 20 });
        const items = (subsList as any)?.result?.items || (subsList as any)?.items || [];

        const matchingSub = items.find((s: any) =>
          (s.status === "active" || s.status === "succeeded") &&
          (s.metadata?.userId === userId ||
            (user && s.customer?.email === user.email) ||
            (user && s.customer?.email?.startsWith(`${user.email.split('@')[0]}+`)))
        );

        if (matchingSub) {
          await PolarService.processSubscriptionActivation({
            checkout_id: matchingSub.id,
            customer_external_id: userId,
            subscription_id: matchingSub.id,
            metadata: matchingSub.metadata,
          });
          subscription = await MembershipRepository.findActiveSubscription(userId);
        }
      } catch (polarSyncErr) {
        console.warn("[Polar Sync Warning] Failed to sync active job seeker sub from Polar API:", polarSyncErr);
      }
    }

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

    // Fallback: If DB subscription is missing or inactive, sync with Polar Sandbox API
    if (!subscription && env.POLAR_ACCESS_TOKEN) {
      try {
        const { PolarService } = await import("../payments/polar.service");
        const user = await User.findById(userId);
        const polar = PolarService.getPolarInstance();
        const subsList = await polar.subscriptions.list({ limit: 20 });
        const items = (subsList as any)?.result?.items || (subsList as any)?.items || [];

        const matchingSub = items.find((s: any) =>
          (s.status === "active" || s.status === "succeeded") &&
          (s.metadata?.userId === userId ||
            (user && s.customer?.email === user.email) ||
            (user && s.customer?.email?.startsWith(`${user.email.split('@')[0]}+`)))
        );

        if (matchingSub) {
          await PolarService.processSubscriptionActivation({
            checkout_id: matchingSub.id,
            customer_external_id: userId,
            subscription_id: matchingSub.id,
            metadata: matchingSub.metadata,
          });
          subscription = await MembershipRepository.findActiveSubscription(userId);
        }
      } catch (polarSyncErr) {
        console.warn("[Polar Sync Warning] Failed to sync active recruiter sub from Polar API:", polarSyncErr);
      }
    }

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
  static async subscribe(
    userId: string,
    userRole: Role,
    membershipId: string,
    billingCycle: BillingCycle = "monthly",
    provider: PaymentProvider = PaymentProvider.MANUAL
  ) {
    const upgradeCalc = await this.calculateProratedUpgrade(userId, userRole, membershipId, billingCycle);
    const plan = upgradeCalc.newPlan;
    const priceDetails = upgradeCalc.priceDetails;

    // Strict Security Guard: Direct activation is strictly limited to Free tier plans (price === 0).
    // Paid plans (price > 0) MUST be paid and verified via Polar or Razorpay checkout.
    if (priceDetails.price > 0 && provider === PaymentProvider.MANUAL) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Paid membership plans cannot be activated directly. Please complete payment via Polar or Razorpay checkout."
      );
    }

    if (upgradeCalc.isUpgrade && upgradeCalc.currentSub) {
      // Mark old active subscription as CANCELLED upon upgrade
      await MembershipRepository.terminateSubscription(
        upgradeCalc.currentSub._id.toString(),
        `Upgraded to ${plan.name}`
      );
    }

    const startDate = new Date();
    const endDate = MembershipService.calculateSubscriptionEndDate(startDate, billingCycle);

    const isFreePlan = priceDetails.price === 0;
    const effectiveProvider = isFreePlan ? PaymentProvider.MANUAL : provider;

    const newSubscription = await MembershipRepository.createSubscription({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      role: userRole,
      planName: plan.name,
      amount: upgradeCalc.finalUpgradePrice,
      currency: priceDetails.currency,
      billingCycle,
      provider: effectiveProvider,
      startDate,
      endDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });

    await Payment.create({
      userId: new Types.ObjectId(userId),
      membershipId: plan._id as Types.ObjectId,
      subscriptionId: newSubscription._id,
      amount: upgradeCalc.finalUpgradePrice,
      currency: priceDetails.currency,
      status: "SUCCESS",
      provider: effectiveProvider,
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
   * Cancel active subscription (disables AutoPay; stays active until paid period ends)
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

    if (activeSub.cancelAtPeriodEnd) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Auto-renewal is already turned off for this subscription."
      );
    }

    // Provider-specific AutoPay cancellation (Polar or Razorpay)
    if (
      activeSub.provider === PaymentProvider.POLAR ||
      (activeSub.providerSubscriptionId && !activeSub.providerSubscriptionId.startsWith("sub_"))
    ) {
      const { PolarService } = await import("../payments/polar.service");
      return PolarService.cancelAutoPay(userId);
    }

    if (
      activeSub.provider === PaymentProvider.RAZORPAY ||
      (activeSub.providerSubscriptionId && activeSub.providerSubscriptionId.startsWith("sub_"))
    ) {
      const { RazorpaySubscriptionService } = await import("../payments/razorpay-subscription.service");
      const res = await RazorpaySubscriptionService.cancelSubscription(userId, true);
      return {
        message: "AutoPay cancelled successfully. Paid access remains active until period end.",
        subscription: res.subscription,
      };
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
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { $gte: now, $lte: threeDaysFromNow },
        isDeleted: { $ne: true },
      }).populate("userId", "email role");

      for (const sub of expiringSubscriptions) {
        const user = sub.userId as any;
        if (user && user.email) {
          const diffMs = new Date(sub.currentPeriodEnd || sub.endDate).getTime() - now.getTime();
          const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

          EmailService.sendSubscriptionRenewalReminder({
            email: user.email,
            name: user.email.split("@")[0],
            planName: sub.planName,
            expiryDate: sub.currentPeriodEnd || sub.endDate,
            daysRemaining,
          }).catch((err) => console.error(`[MembershipService] Failed to send renewal email to ${user.email}:`, err));
        }
      }
    } catch (error) {
      console.error("[MembershipService] Error checking expiring subscriptions:", error);
    }
  }
}
