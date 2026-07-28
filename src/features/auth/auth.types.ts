import { Role } from "../../common/enums/role.enum";

export interface RegisterUserInput {
  email: string;
  password: string;
  role: Role;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface JwtPayload {
  userId: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;

  user: {
    id: string;
    email: string;
    role: Role;
  };
}
export interface RefreshTokenInput {
  refreshToken: string;
}