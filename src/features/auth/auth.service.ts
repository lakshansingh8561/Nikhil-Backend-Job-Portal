import { User, UserProfile, JobSeekerProfile, RecruiterProfile } from "../../database/models";
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
    let user = await User.findOne({ email });

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

      const initialFirstName = payload.given_name || email.split("@")[0];
      const initialLastName = payload.family_name || "";

      await UserProfile.create({
        userId: user._id,
        firstName: initialFirstName,
        lastName: initialLastName,
        profilePicture: payload.picture || "",
      }).catch(() => null);

      if (user.role === Role.JOB_SEEKER) {
        await JobSeekerProfile.create({
          userId: user._id,
          yearsOfExperience: 0,
        }).catch(() => null);
      } else if (user.role === Role.RECRUITER) {
        await RecruiterProfile.create({
          userId: user._id,
          designation: "Recruiter",
        }).catch(() => null);
      }
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, AUTH_MESSAGES.USER_BLOCKED);
    }

    user.lastLogin = new Date();
    await user.save();

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

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
    const lowerEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: lowerEmail });

    if (existingUser) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        AUTH_MESSAGES.EMAIL_ALREADY_EXISTS
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      email: lowerEmail,
      password: hashedPassword,
      role,
    });

    const defaultFirstName = lowerEmail.split("@")[0];

    // Create UserProfile
    await UserProfile.create({
      userId: user._id,
      firstName: defaultFirstName,
      lastName: "",
    }).catch((err) => console.error("UserProfile creation error:", err));

    // Create JobSeekerProfile or RecruiterProfile
    if (role === Role.JOB_SEEKER) {
      await JobSeekerProfile.create({
        userId: user._id,
        yearsOfExperience: 0,
      }).catch((err) => console.error("JobSeekerProfile creation error:", err));
    } else if (role === Role.RECRUITER) {
      await RecruiterProfile.create({
        userId: user._id,
        designation: "Recruiter",
      }).catch((err) => console.error("RecruiterProfile creation error:", err));
    }

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

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
    const lowerEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: lowerEmail }).select("+password");

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
    await user.save();

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

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
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }
  }

  static async getCurrentUser(userId: string) {
    const user = await User.findById(userId).select("-password");

    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }

    let profileObj = await UserProfile.findOne({ userId }).lean();
    if (!profileObj) {
      await UserProfile.create({
        userId: user._id,
        firstName: user.email.split("@")[0],
        lastName: "",
      }).catch(() => null);
      profileObj = await UserProfile.findOne({ userId }).lean();
    }

    return {
      ...user.toObject(),
      profile: profileObj,
    };
  }

  static async refreshToken(token: string) {
    const payload = verifyRefreshToken(token);

    const user = await User.findById(payload.userId);

    if (!user) {
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

    return {
      accessToken,
      refreshToken,
    };
  }

  static async changePassword(
    userId: string,
    payload: { currentPassword?: string; newPassword?: string }
  ) {
    const { currentPassword, newPassword } = payload;

    if (!currentPassword || !newPassword) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Current password and new password are required."
      );
    }

    if (newPassword.length < 6) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "New password must be at least 6 characters long."
      );
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        AUTH_MESSAGES.USER_NOT_FOUND
      );
    }

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        "Current password is incorrect."
      );
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return {
      message: "Password changed successfully.",
    };
  }
}