import { Document, Types } from "mongoose";

/** Asymmetric follow — no approval needed, unlike a connection. */
export interface IFollow extends Document {
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
