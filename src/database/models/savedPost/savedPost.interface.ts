import { Document, Types } from "mongoose";

/** A post bookmarked by a user, surfaced on the "Saved posts" page. */
export interface ISavedPost extends Document {
  userId: Types.ObjectId;
  postId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
