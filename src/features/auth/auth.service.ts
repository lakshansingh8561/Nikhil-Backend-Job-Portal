import { User, JobSeekerProfile, RecruiterProfile } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AUTH_MESSAGES } from "./auth.constants";
import {
  AuthResponse,
  JwtPayload,
  LoginUserInput,
  RegisterUserInput,
} from "./auth.types";
import {
  comparePassword,
  hashPassword,
} from "../../common/utils/hash";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from "../../common/utils/jwt";
import { UserStatus, Role } from "../../common/enums";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  static async googleAuth(credential: string, selectedRole?: string): Promise<AuthResponse> {
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err: any) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Failed to verify Google token.");
    }

    if (!payload || !payload.email) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Invalid Google account data.");
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email }).select("+refreshToken");

    if (!user) {
      const randomPassword = await hashPassword(Math.random().toString(36).slice(-10) + Date.now().toString());
      const assignedRole = (selectedRole && Object.values(Role).includes(selectedRole as Role))
        ? (selectedRole as Role)
        : Role.JOB_SEEKER;

      user = await User.create({
        email,
        password: randomPassword,
        role: assignedRole,
        isVerified: true,
      });

      if (user.role === Role.JOB_SEEKER) {
        await JobSeekerProfile.create({
          userId: user.id,
          firstName: payload.given_name || "Google",
          lastName: payload.family_name || "User",
          profilePicture: payload.picture || "",
        }).catch(() => null);
      } else if (user.role === Role.RECRUITER) {
        await RecruiterProfile.create({
          userId: user.id,
          firstName: payload.given_name || "Google",
          lastName: payload.family_name || "Recruiter",
          phone: "N/A",
          designation: "Hiring Manager",
          profilePicture: payload.picture || "",
        }).catch(() => null);
      }
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, AUTH_MESSAGES.USER_BLOCKED);
    }

    user.lastLogin = new Date();

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    user.refreshToken = refreshToken;
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async register(
    payload: RegisterUserInput
  ): Promise<AuthResponse> {
    const { email, password, role } = payload;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        AUTH_MESSAGES.EMAIL_ALREADY_EXISTS
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
    });
console.log("user", user)
    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };
    console.log("jwt----",jwtPayload)

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    user.refreshToken = refreshToken;
    await user.save();
 console.log("user saved")
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async login(
    payload: LoginUserInput
  ): Promise<AuthResponse> {
    const { email, password } = payload;

    const user = await User.findOne({ email }).select(
      "+password +refreshToken"
    );

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        AUTH_MESSAGES.INVALID_CREDENTIALS
      );
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        AUTH_MESSAGES.USER_BLOCKED
      );
    }

    const isPasswordMatched = await comparePassword(
      password,
      user.password
    );

    if (!isPasswordMatched) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        AUTH_MESSAGES.INVALID_CREDENTIALS
      );
    }

    user.lastLogin = new Date();

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    user.refreshToken = refreshToken;

    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async logout(userId: string): Promise<void> {
    const user = await User.findById(userId).select("+refreshToken");

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }

    user.refreshToken = null;

    await user.save();
  }

  static async getCurrentUser(userId: string) {
    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }

    return user;
  }
static async refreshToken(token: string) {
  const payload = verifyRefreshToken(token);

  const user = await User.findById(payload.userId).select(
    "+refreshToken"
  );

  if (!user) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      AUTH_MESSAGES.INVALID_REFRESH_TOKEN
    );
  }

  if (
    !user.refreshToken ||
    user.refreshToken !== token
  ) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      AUTH_MESSAGES.INVALID_REFRESH_TOKEN
    );
  }

  const jwtPayload: JwtPayload = {
    userId: user.id,
    role: user.role,
  };

  const accessToken = generateAccessToken(jwtPayload);

  const refreshToken = generateRefreshToken(jwtPayload);

  user.refreshToken = refreshToken;

  await user.save();

  return {
    accessToken,
    refreshToken,
  };
}

  
}