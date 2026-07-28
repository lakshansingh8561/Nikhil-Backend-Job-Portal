import { Role } from "../common/enums";

declare global {
  namespace Express {
    interface Request {
      user: {
        userId: string;
        role: Role;
      };
    }
  }
}

export {};