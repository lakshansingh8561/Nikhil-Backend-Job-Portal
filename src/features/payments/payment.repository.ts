import { Payment, IPayment } from "../../database/models";
import { FilterQuery, Types } from "mongoose";
import { PaymentQueryFilters } from "./payment.types";

export class PaymentRepository {
  static async createPayment(data: Partial<IPayment>): Promise<IPayment> {
    return Payment.create(data);
  }

  static async findByRazorpayOrderId(orderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId: orderId });
  }

  static async findByRazorpayPaymentId(paymentId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayPaymentId: paymentId });
  }

  static async findUserPayments(userId: string): Promise<IPayment[]> {
    return Payment.find({ userId: new Types.ObjectId(userId) })
      .populate("membershipId", "name role price durationInDays")
      .populate("subscriptionId")
      .sort({ createdAt: -1 });
  }

  static async findPaymentsWithFilters(filters: PaymentQueryFilters) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const query: FilterQuery<IPayment> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.provider) {
      query.provider = filters.provider;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate("userId", "email role")
        .populate("membershipId", "name role price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(query),
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
