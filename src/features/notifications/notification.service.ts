import { Notification } from "../../database/models";

export interface CreateNotificationInput {
  recipientId: string;
  senderId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

export class NotificationService {
  static async createNotification(payload: CreateNotificationInput) {
    return Notification.create({
      recipientId: payload.recipientId,
      senderId: payload.senderId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || "",
    });
  }

  static async getUserNotifications(userId: string) {
    const notifications = await Notification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({
      recipientId: userId,
      isRead: false,
    });

    return {
      notifications,
      unreadCount,
    };
  }

  static async markAsRead(notificationId: string, userId: string) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: userId },
      { isRead: true },
      { new: true }
    );
    return notification;
  }

  static async markAllAsRead(userId: string) {
    await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { isRead: true }
    );
    return { success: true };
  }
}
