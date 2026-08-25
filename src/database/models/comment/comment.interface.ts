import { Document, Types } from "mongoose";
import { ReactionType } from "../../../common/enums/reactionType.enum";

export interface ICommentReaction {
  userId: Types.ObjectId;
  type: ReactionType;
  createdAt: Date;
}

export interface IComment extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;

  /** null for a top-level comment, set to the parent's id for a reply. */
  parentCommentId?: Types.ObjectId | null;
  repliesCount: number;

  /** Typed reactions. Preferred over `likes`, which stays mirrored. */
  reactions: ICommentReaction[];
  likes: Types.ObjectId[];
  reactionsCount: number;

  mentions: Types.ObjectId[];
  editedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
