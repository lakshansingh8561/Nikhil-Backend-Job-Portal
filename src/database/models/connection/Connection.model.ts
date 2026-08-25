import { Schema, model } from "mongoose";
import { IConnection } from "./connection.interface";
import { ConnectionStatus } from "../../../common/enums/connectionStatus.enum";

const connectionSchema = new Schema<IConnection>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ConnectionStatus),
      default: ConnectionStatus.PENDING,
      index: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// One row per ordered pair. Reverse-direction duplicates are rejected in the
// service, which queries both orderings before inserting.
connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
connectionSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
connectionSchema.index({ requesterId: 1, status: 1, createdAt: -1 });

export const Connection = model<IConnection>("Connection", connectionSchema);
