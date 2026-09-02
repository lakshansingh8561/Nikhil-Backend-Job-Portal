import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

import { Blog, BlogComment, User } from "./database/models";
import { Role } from "./common/enums/role.enum";

const sampleBlogs = [
  {
    title: "21 Job Interview Tips: How To Make a Great Impression",
    slug: "21-job-interview-tips-how-to-make-a-great-impression",
    excerpt: "Our mission is to create the world's most sustainable healthcare company by creating high-quality healthcare products in iconic, sustainable packaging.",
    content: `
      <h2>1. Research the Company Culture and Values</h2>
      <p>Before stepping into any interview, thoroughly investigate the company's background, recent press releases, product releases, and corporate culture. Knowing their core values shows genuine dedication.</p>
      
      <h2>2. Master the STAR Method for Behavioral Questions</h2>
      <p>Structure your responses using <strong>Situation, Task, Action, and Result</strong>. This keeps your answers concise, structured, and impact-driven.</p>

      <h2>3. Prepare Thoughtful Questions for the Interviewer</h2>
      <p>At the end of every interview, always ask questions about team dynamics, company growth metrics, and what success looks like in the first 90 days.</p>
    `,
    coverImage: {
      url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80",
      publicId: "sample_cover_1",
    },
    category: "Interview",
    tags: ["Interview", "Career", "Job Search"],
    status: "published",
    views: 128,
    uniqueViews: 94,
    readTime: 8,
    publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  },
  {
    title: "Email Examples: How To Respond to Employer Interview Requests",
    slug: "email-examples-how-to-respond-to-employer-interview-requests",
    excerpt: "Our mission is to create the world's most sustainable healthcare company by creating high-quality healthcare products in iconic, sustainable packaging.",
    content: `
      <h2>Responding Quickly and Professionally</h2>
      <p>Prompt responses reflect reliability and eagerness. Always confirm the date, time zone, format (video call or in-person), and ask if any preparation is needed.</p>

      <h3>Sample Response Email Template</h3>
      <blockquote style="background:#f8fafc; padding:15px; border-left:4px solid #3C65F5; margin:15px 0;">
        Dear Hiring Manager,<br/><br/>
        Thank you for inviting me to interview for the position! I am available on Thursday at 2:00 PM EST. Please let me know if this time works for you.<br/><br/>
        Best regards,<br/>
        Candidate Name
      </blockquote>
    `,
    coverImage: {
      url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&auto=format&fit=crop&q=80",
      publicId: "sample_cover_2",
    },
    category: "Events",
    tags: ["Email", "Communication", "Workplace"],
    status: "published",
    views: 89,
    uniqueViews: 65,
    readTime: 5,
    publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
  },
  {
    title: "11 Tips to Help You Get New Clients Through Cold Calling",
    slug: "11-tips-to-help-you-get-new-clients-through-cold-calling",
    excerpt: "Learn how to craft compelling cold outreach messages, build rapport over the phone, and convert prospects into high-paying client contracts.",
    content: `
      <h2>1. Build a Targeted Prospect List</h2>
      <p>Focus on decision-makers who have explicit needs matching your service offerings. Quality always beats quantity in outbound lead generation.</p>

      <h2>2. Hook the Prospect in the First 10 Seconds</h2>
      <p>Acknowledge their time, state your value proposition clearly, and ask permission to continue the conversation.</p>
    `,
    coverImage: {
      url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&auto=format&fit=crop&q=80",
      publicId: "sample_cover_3",
    },
    category: "News",
    tags: ["Sales", "Recruitment", "Outreach"],
    status: "published",
    views: 245,
    uniqueViews: 180,
    readTime: 6,
    publishedAt: new Date(), // Today
  },
];

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/job-portal";
    console.log("Connecting to MongoDB for seeding sample blogs & comments...");
    await mongoose.connect(mongoUri);

    let authorUser = await User.findOne({ isDeleted: false });
    if (!authorUser) {
      console.log("Creating default author user...");
      authorUser = await User.create({
        email: "author@jobportal.com",
        password: "Password123!",
        role: Role.JOB_SEEKER,
        status: "ACTIVE",
        isVerified: true,
      });
    }

    console.log(`Using author user ID: ${authorUser._id}`);

    for (const sample of sampleBlogs) {
      let blog = await Blog.findOne({ slug: sample.slug });
      if (!blog) {
        blog = await Blog.create({
          ...sample,
          author: authorUser._id,
          authorRole: authorUser.role || Role.JOB_SEEKER,
        });
        console.log(`✅ Created sample blog: "${sample.title}"`);
      } else {
        console.log(`ℹ️ Sample blog already exists: "${sample.title}"`);
      }

      // Seed sample comments
      const commentCount = await BlogComment.countDocuments({ blog: blog._id });
      if (commentCount === 0) {
        await BlogComment.create([
          {
            blog: blog._id,
            name: "Robert Fox",
            email: "robert.fox@example.com",
            avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
            content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ultricies interdum massa nec fermentum. Phasellus interdum dignissim rhoncus.",
            isApproved: true,
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            blog: blog._id,
            name: "Jenny Wilson",
            email: "jenny.wilson@example.com",
            avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
            content: "White white dreamy drama tically place everything although. Place out apartment afternoon whimsical kinder, little romantic joy we flowers handmade.",
            isApproved: true,
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          },
          {
            blog: blog._id,
            name: "Eleanor Pena",
            email: "eleanor.pena@example.com",
            avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
            content: "Great insights! The tips on preparing for behavioral questions were super helpful.",
            isApproved: true,
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        ]);
        await Blog.findByIdAndUpdate(blog._id, { commentsCount: 3 });
        console.log(`💬 Added 3 sample comments to blog: "${blog.title}"`);
      }
    }

    console.log("🎉 Sample blog & comment seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding sample blogs & comments:", err);
    process.exit(1);
  }
}

seed();
