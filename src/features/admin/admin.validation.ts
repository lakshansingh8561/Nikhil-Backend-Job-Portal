import { z } from "zod";
import { UserStatus } from "../../common/enums/userStatus.enum";

const updateUserStatus = z.object({
  body: z.object({
    status: z.nativeEnum(UserStatus),
  }),
});

export const AdminValidation = {
  updateUserStatus,
};