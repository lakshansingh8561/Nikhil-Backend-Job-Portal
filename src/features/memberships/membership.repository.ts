import { Types } from "mongoose";
import {
  Membership,
  Subscription,
  IMembership,
  ISubscription,
} from "../../database/models";

export class MembershipRepository {
  /**
   * Find membership plan by ID
   */
  static async findMembershipById(id: string): Promise<IMembership | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return Membership.findById(id);
  }

  /**
   * Find active memberships by role
   */
  static async findActiveMemberships(role: string): Promise<IMembership[]> {
    return Membership.find({ role, isActive: true }).sort({ price: 1 });
  }

  /**
   * Count total memberships in DB (used for seeding)
   */
  static async countMemberships(): Promise<number> {
    return Membership.countDocuments();
  }

  /**
   * Bulk insert default memberships
   */
  static async insertDefaultMemberships(plans: any[]): Promise<void> {
    await Membership.insertMany(plans);
  }

  /**
   * Find user's active subscription
   */
  static async findActiveSubscription(userId: string): Promise<ISubscription | null> {
    return Subscription.findOne({
      userId: new Types.ObjectId(userId),
      status: "ACTIVE",
    }).populate("membershipId");
  }

  /**
   * Expire all active subscriptions for user
   */
  static async expireActiveSubscriptions(userId: string): Promise<void> {
    await Subscription.updateMany(
      {
        userId: new Types.ObjectId(userId),
        status: "ACTIVE",
      },
      {
        $set: {
          status: "EXPIRED",
        },
      }
    );
  }

  /**
   * Create a new subscription
   */
  static async createSubscription(data: Partial<ISubscription>): Promise<ISubscription> {
    const subscription = await Subscription.create(data);
    return Subscription.findById(subscription._id).populate("membershipId") as Promise<ISubscription>;
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(subscriptionId: string): Promise<ISubscription | null> {
    return Subscription.findByIdAndUpdate(
      subscriptionId,
      {
        $set: {
          status: "CANCELLED",
          autoRenew: false,
          cancelledAt: new Date(),
        },
      },
      { new: true }
    ).populate("membershipId");
  }

  /**
   * Get subscription history for user
   */
  static async findSubscriptionHistory(userId: string): Promise<ISubscription[]> {
    return Subscription.find({
      userId: new Types.ObjectId(userId),
    })
      .populate("membershipId")
      .sort({ createdAt: -1 });
  }
}
