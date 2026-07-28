import { UserStatus } from "../../common/enums/userStatus.enum";

export interface DashboardStats {
  totalUsers: number;
  totalRecruiters: number;
  totalJobSeekers: number;
  totalJobs: number;
  totalApplications: number;
}

export interface UpdateUserStatusInput {
  status: UserStatus;
}