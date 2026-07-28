import { Role } from "../../common/enums/role.enum";

export interface RegisterDto {
  email: string;
  password: string;
  role: Role;
}