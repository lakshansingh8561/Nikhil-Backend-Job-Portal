import { User, UserProfile, JobSeekerProfile, RecruiterProfile, Otp } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AUTH_MESSAGES } from "./auth.constants";
import { EmailService } from "../../common/services/email.service";
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

      // Notify admin about new Google Auth user registration
      EmailService.sendAdminUserActivityNotification({
        userEmail: user.email,
        role: user.role,
        actionType: "SIGNUP",
      }).catch((err) => console.error("[AuthService] Admin notification signup email error:", err));
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

  static async sendRegistrationOtp(email: string): Promise<{ message: string }> {
    if (!email || !email.includes("@")) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address.");
    }
    const lowerEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: lowerEmail });
    if (existingUser) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        AUTH_MESSAGES.EMAIL_ALREADY_EXISTS
      );
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email: lowerEmail });
    await Otp.create({
      email: lowerEmail,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    console.log(`\n======================================================`);
    console.log(`✉️ [REGISTRATION OTP] Destination: ${lowerEmail}`);
    console.log(`✉️ OTP CODE: ${otpCode}`);
    console.log(`======================================================\n`);

    const sent = await EmailService.sendRegistrationOtp({
      email: lowerEmail,
      otp: otpCode,
    });

    if (!sent) {
      console.warn(`[AuthService] Fallback OTP for ${lowerEmail}: ${otpCode}`);
    }

    return {
      message: `Verification code sent to ${lowerEmail}.`,
    };
  }

  static async verifyOtpAndRegister(
    payload: RegisterUserInput & { otp: string }
  ): Promise<AuthResponse> {
    const { email, password, role, otp } = payload;
    if (!otp || otp.trim().length !== 6) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Please enter a valid 6-digit OTP code.");
    }

    const lowerEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: lowerEmail });
    if (existingUser) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        AUTH_MESSAGES.EMAIL_ALREADY_EXISTS
      );
    }

    const otpRecord = await Otp.findOne({ email: lowerEmail }).sort({ createdAt: -1 });

    if (!otpRecord) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "No OTP requested for this email or OTP expired. Please request a new OTP."
      );
    }

    if (otpRecord.expiresAt < new Date()) {
      await Otp.deleteMany({ email: lowerEmail });
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "OTP code has expired. Please request a new OTP code."
      );
    }

    if (otpRecord.otp.trim() !== otp.trim()) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Incorrect OTP code. Please enter the correct verification code sent to your email."
      );
    }

    // OTP verified successfully, clean up OTP record
    await Otp.deleteMany({ email: lowerEmail });

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      email: lowerEmail,
      password: hashedPassword,
      role,
      isVerified: true,
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

    // Notify admin about new user registration
    EmailService.sendAdminUserActivityNotification({
      userEmail: user.email,
      role: user.role,
      actionType: "SIGNUP",
    }).catch((err) => console.error("[AuthService] Admin notification signup email error:", err));

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
      isVerified: true,
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

    // Notify admin about new user registration
    EmailService.sendAdminUserActivityNotification({
      userEmail: user.email,
      role: user.role,
      actionType: "SIGNUP",
    }).catch((err) => console.error("[AuthService] Admin notification signup email error:", err));

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

  /**
   * Send Password Reset OTP Email
   */
  static async sendForgotPasswordOtp(email: string): Promise<{ message: string }> {
    if (!email || !email.includes("@")) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address.");
    }
    const lowerEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: lowerEmail });
    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "No registered account found with this email address."
      );
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, AUTH_MESSAGES.USER_BLOCKED);
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email: lowerEmail });
    await Otp.create({
      email: lowerEmail,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    console.log(`\n======================================================`);
    console.log(`🔑 [PASSWORD RESET OTP] Destination: ${lowerEmail}`);
    console.log(`🔑 OTP CODE: ${otpCode}`);
    console.log(`======================================================\n`);

    const sent = await EmailService.sendForgotPasswordOtp({
      email: lowerEmail,
      otp: otpCode,
    });

    if (!sent) {
      console.warn(`[AuthService] Gmail SMTP dispatch fallback for ${lowerEmail}. OTP CODE: ${otpCode}`);
      return {
        message: `Verification code: ${otpCode} (Gmail SMTP delivery delayed/suppressed). Please use code ${otpCode} to reset.`,
      };
    }

    return {
      message: `Password reset verification code sent to ${lowerEmail}. Please check your inbox!`,
    };
  }

  /**
   * Verify Password Reset OTP and update User Password
   */
  static async resetPasswordWithOtp(payload: {
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { email, otp, newPassword } = payload;

    if (!email || !email.includes("@")) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address.");
    }

    if (!otp || otp.trim().length !== 6) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Please enter a valid 6-digit OTP code.");
    }

    if (!newPassword || newPassword.length < 6) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "New password must be at least 6 characters long."
      );
    }

    const lowerEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: lowerEmail });
    if (!user) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        "No registered account found with this email address."
      );
    }

    const otpRecord = await Otp.findOne({ email: lowerEmail }).sort({ createdAt: -1 });

    if (!otpRecord) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "No OTP code requested for this email or OTP expired. Please request a new code."
      );
    }

    if (otpRecord.expiresAt < new Date()) {
      await Otp.deleteMany({ email: lowerEmail });
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Verification code has expired. Please request a new OTP code."
      );
    }

    if (otpRecord.otp.trim() !== otp.trim()) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Incorrect verification code. Please enter the correct 6-digit code sent to your email."
      );
    }

    // OTP is valid! Delete used OTP records
    await Otp.deleteMany({ email: lowerEmail });

    // Update password
    user.password = await hashPassword(newPassword);
    await user.save();

    // Send confirmation email
    EmailService.sendPasswordChangedNotification({ email: lowerEmail }).catch((err) =>
      console.error("[AuthService] Error sending password changed notification email:", err)
    );

    return {
      message: "Password reset successfully! You can now log in with your new password.",
    };
  }
}