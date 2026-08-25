import { Document, Types } from "mongoose";
import { ConnectionStatus } from "../../../common/enums/connectionStatus.enum";

/**
 * One row per invitation. A single row represents the whole relationship:
 * PENDING while the invite is outstanding, ACCEPTED once both are connected.
 * The service checks both directions before inserting so A->B and B->A can
 * never both be pending.
 */
export interface IConnection extends Document {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: ConnectionStatus;
  message?: string;
  respondedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
