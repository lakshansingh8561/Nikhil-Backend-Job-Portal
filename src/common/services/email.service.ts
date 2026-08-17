import nodemailer from "nodemailer";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static getTransporter() {
    const rawUser = (process.env.EMAIL_USER || "lakshansingh8561@gmail.com").trim();
    const rawPass = (process.env.EMAIL_PASS || "fhjy uzti gwop lfsq").replace(/\s+/g, "");

    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: rawUser,
        pass: rawPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  private static get fromEmail() {
    return (process.env.EMAIL_FROM || process.env.EMAIL_USER || "lakshansingh8561@gmail.com").trim();
  }

  /**
   * Generic send email method
   */
  public static async sendMail({ to, subject, html, text }: SendMailOptions): Promise<boolean> {
    try {
      if (!to) return false;
      
      const plainText = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const transporter = this.getTransporter();

      const info = await transporter.sendMail({
        from: `"JobBox Portal" <${this.fromEmail}>`,
        to,
        subject,
        text: plainText,
        html,
      });
      console.log(`[EmailService] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`[EmailService] Error sending email to ${to}:`, error);
      return false;
    }
  }

  /**
   * 1. Send email to Recruiter when a Job Seeker applies
   */
  public static async sendApplicationSubmittedToRecruiter({
    recruiterEmail,
    recruiterName = "Hiring Manager",
    applicantName,
    applicantEmail,
    jobTitle,
    companyName = "your company",
    coverLetter = "",
  }: {
    recruiterEmail: string;
    recruiterName?: string;
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    companyName?: string;
    coverLetter?: string;
  }) {
    const subject = `📌 New Candidate Application: ${applicantName} applied for ${jobTitle}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #05264E 0%, #3B5BDB 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
          .content { padding: 32px 24px; color: #05264E; }
          .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #05264E; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 24px; }
          .card { background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #eaeff7; margin-bottom: 24px; }
          .card-title { font-size: 14px; font-weight: 700; color: #05264E; margin-bottom: 12px; border-bottom: 1px solid #eaeff7; padding-bottom: 8px; }
          .info-row { font-size: 13px; margin-bottom: 8px; color: #66789c; }
          .info-row strong { color: #05264E; font-weight: 600; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background: #3B5BDB; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 12px rgba(59,91,219,0.3); }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Portal</h1>
            <p>New Applicant Notification</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${recruiterName},</div>
            <div class="message">
              Great news! A new candidate has just submitted an application for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.
            </div>
            
            <div class="card">
              <div class="card-title">Applicant Summary</div>
              <div class="info-row"><strong>Candidate Name:</strong> ${applicantName}</div>
              <div class="info-row"><strong>Email Address:</strong> ${applicantEmail}</div>
              <div class="info-row"><strong>Position Applied:</strong> ${jobTitle}</div>
              ${coverLetter ? `<div class="info-row" style="margin-top: 12px;"><strong>Cover Letter Preview:</strong><br/><span style="font-style: italic; color: #475569;">"${coverLetter.slice(0, 180)}${coverLetter.length > 180 ? "..." : ""}"</span></div>` : ""}
            </div>

            <div class="message">
              Log in to your recruiter dashboard to evaluate the candidate's resume and manage application status.
            </div>

            <div class="btn-container">
              <a href="http://localhost:5173/recruiter/applications" class="btn">Review Application</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
    return this.sendMail({ to: recruiterEmail, subject, html });
  }

  /**
   * 2. Send email to Job Seeker when Status Updates (Shortlisted, Interview, Hired, Rejected)
   */
  public static async sendStatusUpdateToJobSeeker({
    applicantEmail,
    applicantName = "Candidate",
    jobTitle,
    companyName = "Hiring Company",
    status,
    notes = "",
  }: {
    applicantEmail: string;
    applicantName?: string;
    jobTitle: string;
    companyName?: string;
    status: string;
    notes?: string;
  }) {
    let subject = `Application Update: ${jobTitle} at ${companyName}`;
    let badgeText = "Status Updated";
    let headerBg = "linear-gradient(135deg, #05264E 0%, #3B5BDB 100%)";
    let messageText = `Your application status for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated to <strong>${status}</strong>.`;

    if (status === "SHORTLISTED") {
      subject = `⭐ Congratulations! Shortlisted for ${jobTitle} at ${companyName}`;
      badgeText = "Shortlisted";
      headerBg = "linear-gradient(135deg, #059669 0%, #10B981 100%)";
      messageText = `Great news! Your profile has been <strong>shortlisted</strong> for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>. The hiring team is evaluating your qualifications for the next round.`;
    } else if (status === "INTERVIEW") {
      subject = `🎉 Interview Invitation: ${jobTitle} at ${companyName}`;
      badgeText = "Interview Scheduled";
      headerBg = "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)";
      messageText = `Congratulations! You have been <strong>invited for an interview</strong> for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>. Please check your dashboard for interview instructions and details.`;
    } else if (status === "HIRED") {
      subject = `🎊 Offer & Selection: You're Hired for ${jobTitle} at ${companyName}!`;
      badgeText = "Application Hired";
      headerBg = "linear-gradient(135deg, #047857 0%, #059669 100%)";
      messageText = `We are thrilled to inform you that you have been <strong>selected & hired</strong> for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>! Congratulations on your new career milestone.`;
    } else if (status === "REJECTED") {
      subject = `Update regarding your application for ${jobTitle} at ${companyName}`;
      badgeText = "Application Update";
      headerBg = "linear-gradient(135deg, #475569 0%, #64748B 100%)";
      messageText = `Thank you for taking the time to apply for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>. Although your credentials are impressive, the hiring team has decided to move forward with other candidates at this time.`;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: ${headerBg}; padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
          .content { padding: 32px 24px; color: #05264E; }
          .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #05264E; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 24px; }
          .card { background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #eaeff7; margin-bottom: 24px; }
          .card-title { font-size: 14px; font-weight: 700; color: #05264E; margin-bottom: 12px; border-bottom: 1px solid #eaeff7; padding-bottom: 8px; }
          .info-row { font-size: 13px; margin-bottom: 8px; color: #66789c; }
          .info-row strong { color: #05264E; font-weight: 600; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background: #3B5BDB; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 12px rgba(59,91,219,0.3); }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Portal</h1>
            <p>${badgeText}</p>
          </div>
          <div class="content">
            <div class="greeting">Dear ${applicantName},</div>
            <div class="message">
              ${messageText}
            </div>

            <div class="card">
              <div class="card-title">Application Status Summary</div>
              <div class="info-row"><strong>Position:</strong> ${jobTitle}</div>
              <div class="info-row"><strong>Company:</strong> ${companyName}</div>
              <div class="info-row"><strong>Updated Status:</strong> <span style="font-weight: 700; color: #3B5BDB;">${status}</span></div>
              ${notes ? `<div class="info-row" style="margin-top: 10px;"><strong>Hiring Note:</strong> ${notes}</div>` : ""}
            </div>

            <div class="btn-container">
              <a href="http://localhost:5173/job-seeker/applications" class="btn">View Application Status</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
    return this.sendMail({ to: applicantEmail, subject, html });
  }

  /**
   * 3. Send email to Job Seeker when Recruiter Views Application
   */
  public static async sendApplicationViewedToJobSeeker({
    applicantEmail,
    applicantName = "Candidate",
    jobTitle,
    companyName = "Hiring Team",
  }: {
    applicantEmail: string;
    applicantName?: string;
    jobTitle: string;
    companyName?: string;
  }) {
    const subject = `👁️ Application Reviewed: ${jobTitle} at ${companyName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #05264E 0%, #3B5BDB 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
          .content { padding: 32px 24px; color: #05264E; }
          .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #05264E; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 24px; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background: #3B5BDB; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Portal</h1>
            <p>Application Review Notification</p>
          </div>
          <div class="content">
            <div class="greeting">Dear ${applicantName},</div>
            <div class="message">
              The hiring manager at <strong>${companyName}</strong> has just reviewed your resume and application profile for the position of <strong>${jobTitle}</strong>.
            </div>
            <div class="btn-container">
              <a href="http://localhost:5173/job-seeker/applications" class="btn">View My Dashboard</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
    return this.sendMail({ to: applicantEmail, subject, html });
  }

  /**
   * 4. Send email confirmation to Job Seeker when they apply for a job
   */
  public static async sendApplicationConfirmationToJobSeeker({
    applicantEmail,
    applicantName = "Candidate",
    jobTitle,
    companyName = "Hiring Company",
  }: {
    applicantEmail: string;
    applicantName?: string;
    jobTitle: string;
    companyName?: string;
  }) {
    const subject = `✅ Application Confirmed: You applied for ${jobTitle} at ${companyName}`;
    const formattedDate = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #05264E 0%, #3C65F5 100%); padding: 36px 24px; text-align: center; color: #ffffff; }
          .header-badge { display: inline-block; background: rgba(255,255,255,0.15); padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.2); }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
          .content { padding: 32px 24px; color: #05264E; }
          .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #05264E; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 24px; }
          .card { background: #f8fafc; border-radius: 14px; padding: 22px; border: 1px solid #eaeff7; margin-bottom: 24px; }
          .card-title { font-size: 13px; font-weight: 800; color: #05264E; margin-bottom: 14px; border-bottom: 1px solid #eaeff7; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-row { font-size: 13px; margin-bottom: 10px; color: #66789c; display: flex; justify-content: space-between; }
          .info-row strong { color: #05264E; font-weight: 600; }
          .status-pill { background: #E8F0FE; color: #3C65F5; font-weight: 700; padding: 3px 10px; border-radius: 8px; font-size: 12px; display: inline-block; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background: #3C65F5; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 14px rgba(60,101,245,0.35); }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-badge">Application Submitted</div>
            <h1>JobBox Portal</h1>
            <p>Your application was successfully sent!</p>
          </div>
          <div class="content">
            <div class="greeting">Hi ${applicantName},</div>
            <div class="message">
              Thank you for applying! Your job application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been successfully submitted to the hiring team.
            </div>
            
            <div class="card">
              <div class="card-title">Application Summary</div>
              <div class="info-row"><span>Position Applied:</span> <strong>${jobTitle}</strong></div>
              <div class="info-row"><span>Company:</span> <strong>${companyName}</strong></div>
              <div class="info-row"><span>Date Applied:</span> <strong>${formattedDate}</strong></div>
              <div class="info-row"><span>Status:</span> <span class="status-pill">APPLIED</span></div>
            </div>

            <div class="message">
              The hiring team will evaluate your resume and credentials. You can track your application status anytime from your JobBox candidate dashboard.
            </div>

            <div class="btn-container">
              <a href="http://localhost:5173/job-seeker/applications" class="btn">View My Application</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
    return this.sendMail({ to: applicantEmail, subject, html });
  }

  /**
   * 5. Send Subscription Renewal Reminder email (3 days prior to expiry)
   */
  public static async sendSubscriptionRenewalReminder({
    email,
    name = "Member",
    planName,
    expiryDate,
    daysRemaining = 3,
  }: {
    email: string;
    name?: string;
    planName: string;
    expiryDate: Date;
    daysRemaining?: number;
  }) {
    const formattedExpiry = new Date(expiryDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const subject = `⚠️ Membership Expiring Soon: ${daysRemaining} days left on your ${planName} Plan`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #D97706 0%, #F59E0B 100%); padding: 36px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; }
          .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.95; }
          .content { padding: 32px 24px; color: #05264E; }
          .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 24px; }
          .card { background: #FFFBEB; border-radius: 14px; padding: 20px; border: 1px solid #FDE68A; margin-bottom: 24px; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background: #D97706; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Membership</h1>
            <p>Renewal Reminder</p>
          </div>
          <div class="content">
            <div class="greeting">Hi ${name},</div>
            <div class="message">
              Your <strong>${planName} Membership</strong> is set to expire on <strong>${formattedExpiry}</strong> (${daysRemaining} days remaining).
            </div>
            <div class="card">
              <div style="font-weight: 700; color: #92400E; margin-bottom: 6px;">Don't lose your plan benefits!</div>
              <div style="font-size: 13px; color: #B45309;">Renew now to maintain uninterrupted access to job postings, applicant tracking, and recruiter features.</div>
            </div>
            <div class="btn-container">
              <a href="http://localhost:5173/recruiter/pricing" class="btn">Renew Membership Now</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
    return this.sendMail({ to: email, subject, html });
  }

  /**
   * 6. Send email notification to Admin when a new User or Recruiter signs up or logs in
   */
  public static async sendAdminUserActivityNotification({
    userEmail,
    role,
    actionType,
    userFullName = "",
  }: {
    userEmail: string;
    role: string;
    actionType: "SIGNUP" | "LOGIN";
    userFullName?: string;
  }) {
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_USER || "lakshansingh8561@gmail.com";
    const actionLabel = actionType === "SIGNUP" ? "🆕 New User Registration" : "🔑 User Login Event";
    const subject = `[JobBox Admin Alert] ${actionLabel}: ${userEmail} (${role})`;

    const formattedTime = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #05264E 0%, #1D4ED8 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
          .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 32px 24px; color: #05264E; }
          .card { background: #f8fafc; border-radius: 14px; padding: 20px; border: 1px solid #eaeff7; margin: 20px 0; }
          .info-row { font-size: 13px; margin-bottom: 10px; color: #66789c; display: flex; justify-content: space-between; }
          .info-row strong { color: #05264E; font-weight: 700; }
          .role-pill { background: #E8F0FE; color: #1D4ED8; font-weight: 800; padding: 3px 10px; border-radius: 8px; font-size: 11px; text-transform: uppercase; }
          .footer { background: #f8fafc; padding: 18px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Admin System Alert</h1>
            <p>${actionLabel}</p>
          </div>
          <div class="content">
            <div style="font-size: 16px; font-weight: 700; color: #05264E; margin-bottom: 12px;">
              Admin Notification: User ${actionType === "SIGNUP" ? "Signed Up" : "Logged In"}
            </div>
            <p style="font-size: 14px; color: #66789c; line-height: 1.6;">
              A user account event was detected on JobBox Portal. Below are the activity details:
            </p>

            <div class="card">
              <div class="info-row"><span>Event Type:</span> <strong>${actionType}</strong></div>
              <div class="info-row"><span>User Email:</span> <strong>${userEmail}</strong></div>
              ${userFullName ? `<div class="info-row"><span>Full Name:</span> <strong>${userFullName}</strong></div>` : ""}
              <div class="info-row"><span>Account Role:</span> <span class="role-pill">${role}</span></div>
              <div class="info-row"><span>Timestamp:</span> <strong>${formattedTime}</strong></div>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Platform Security & Administration.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: adminEmail, subject, html });
  }

  /**
   * 7. Send Registration OTP Code to user
   */
  public static async sendRegistrationOtp({
    email,
    otp,
  }: {
    email: string;
    otp: string;
  }) {
    const subject = `🔐 ${otp} is your JobBox Email Verification Code`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fc; margin: 0; padding: 0; }
          .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #eaeff7; }
          .header { background: linear-gradient(135deg, #05264E 0%, #1D4ED8 100%); padding: 36px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; }
          .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; font-weight: 500; }
          .content { padding: 36px 28px; color: #05264E; text-align: center; }
          .greeting { font-size: 18px; font-weight: 800; margin-bottom: 12px; color: #05264E; text-align: left; }
          .message { font-size: 14px; line-height: 1.6; color: #66789c; margin-bottom: 28px; text-align: left; }
          .otp-card { background: #F8FAFC; border-radius: 16px; padding: 28px 20px; border: 2px dashed #3B5BDB; margin: 24px 0; text-align: center; }
          .otp-label { font-size: 11px; font-weight: 800; color: #66789C; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; }
          .otp-code { font-size: 38px; font-weight: 900; color: #1D4ED8; letter-spacing: 8px; font-family: monospace; }
          .expiry-note { font-size: 12px; color: #94A3B8; margin-top: 10px; font-weight: 600; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeff7; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>JobBox Portal</h1>
            <p>Email Address Verification</p>
          </div>
          <div class="content">
            <div class="greeting">Verify your email address</div>
            <div class="message">
              Welcome to JobBox! Please use the 6-digit verification code below to complete your registration. This code will expire in <strong>10 minutes</strong>.
            </div>

            <div class="otp-card">
              <div class="otp-label">Your Verification OTP Code</div>
              <div class="otp-code">${otp}</div>
              <div class="expiry-note">Valid for 10 minutes • Do not share this code with anyone</div>
            </div>

            <div class="message" style="font-size: 12px; color: #94A3B8;">
              If you did not request this email, please ignore it or contact our support team.
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JobBox Recruitment Platform. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: email, subject, html });
  }
}
