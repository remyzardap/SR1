
import nodemailer from "nodemailer";
import { ENV } from "./env";

const transporter = nodemailer.createTransport({
  host: ENV.emailHost,
  port: ENV.emailPort,
  secure: ENV.emailPort === 465,
  auth: {
    user: ENV.emailUser,
    pass: ENV.emailPassword,
  },
});

export async function sendEmailVerification(email: string, token: string) {
  const verifyLink = `${ENV.appUrl}/verify-email?token=${token}`;
  const mailOptions = {
    from: ENV.emailFrom,
    to: email,
    subject: "Verify your Sutaeru email address",
    html: `
      <p>Hi there,</p>
      <p>Thanks for signing up for Sutaeru! Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
      <p>Thanks,</p>
      <p>The Sutaeru Team</p>
    `,
  };
  await transporter.sendMail(mailOptions);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetLink = `${ENV.appUrl}/reset-password?token=${token}`;
  const mailOptions = {
    from: ENV.emailFrom,
    to: email,
    subject: "Reset your Sutaeru password",
    html: `
      <p>Hi there,</p>
      <p>You recently requested to reset your password for your Sutaeru account. Click the link below to proceed:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
      <p>Thanks,</p>
      <p>The Sutaeru Team</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}
