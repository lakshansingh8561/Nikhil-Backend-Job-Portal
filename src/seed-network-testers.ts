/**
 * Local-only helper: creates two verified accounts so the network section can be
 * driven end-to-end in a browser without going through the emailed OTP flow.
 * Safe to re-run — it upserts and always resets the password.
 *
 *   npx tsx src/seed-network-testers.ts
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import {
  User,
  UserProfile,
  JobSeekerProfile,
  RecruiterProfile,
} from "./database/models";
import { hashPassword } from "./common/utils/hash";
import { Role } from "./common/enums/role.enum";
import { UserStatus } from "./common/enums/userStatus.enum";

const PASSWORD = "TestPass123!";

const TESTERS = [
  {
    email: "network.seeker@localtest.dev",
    role: Role.JOB_SEEKER,
    firstName: "Ava",
    lastName: "Sharma",
    headline: "Frontend Engineer · React & TypeScript",
  },
  {
    email: "network.recruiter@localtest.dev",
    role: Role.RECRUITER,
    firstName: "Rohan",
    lastName: "Mehta",
    headline: "Talent Partner at Northwind Labs",
  },
];

async function seed() {
  await connectDatabase();
  const password = await hashPassword(PASSWORD);

  for (const tester of TESTERS) {
    let user = await User.findOne({ email: tester.email });

    if (user) {
      user.password = password;
      user.isVerified = true;
      user.isDeleted = false;
      user.status = UserStatus.ACTIVE;
      await user.save();
    } else {
      user = await User.create({
        email: tester.email,
        password,
        role: tester.role,
        isVerified: true,
        status: UserStatus.ACTIVE,
      });
    }

    await UserProfile.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        firstName: tester.firstName,
        lastName: tester.lastName,
        headline: tester.headline,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (tester.role === Role.JOB_SEEKER) {
      await JobSeekerProfile.findOneAndUpdate(
        { userId: user._id },
        { userId: user._id },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      await RecruiterProfile.findOneAndUpdate(
        { userId: user._id },
        { userId: user._id, designation: "Talent Partner" },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`ready: ${tester.email} (${tester.role}) id=${user._id}`);
  }

  console.log(`password for both: ${PASSWORD}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
