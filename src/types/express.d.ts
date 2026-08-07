import type { ObjectId } from "mongodb";
import type { UserRole, UserStatus } from "../constants/domain.js";

declare global {
  namespace Express {
    interface Request {
      principal?: {
        authUserId: string;
        appUserId: ObjectId;
        email: string;
        role: UserRole;
        status: UserStatus;
      };
    }
  }
}

export {};
