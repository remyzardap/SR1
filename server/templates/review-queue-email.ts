export interface ReviewQueueEmailData {
  businessName: string;
  receiptId: string;
  submitterName: string;
  submitterEmail: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  category: string;
  receiptImageUrl?: string;
  reviewUrl: string;
  approveUrl: string;
  rejectUrl: string;
}

export function generateReviewQueueEmail(data: ReviewQueueEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    businessName,
    receiptId,
    submitterName,
    submitterEmail,
    amount,
    currency,
    date,
    description,
    category,
    receiptImageUrl,
    reviewUrl,
    approveUrl,
    rejectUrl,
  } = data;

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);

  const subject = `Action Required: Review Receipt Submission - ${formattedAmount}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Review Required</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
      .button { width: 100% !important; display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" class="container" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Sutaeru Business</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">Receipt Review Required</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 20px; font-weight: 600;">
                Hello ${businessName} Team,
              </h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                A new receipt has been submitted and requires your review before it can be processed.
              </p>
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; margin-bottom: 32px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" style="width: 100%;">
                      <tr><td style="padding-bottom: 16px;">
                        <span style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Pending Review</span>
                      </td></tr>
                      <tr><td style="padding-bottom: 16px;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Amount</p>
                        <p style="margin: 4px 0 0; color: #1f2937; font-size: 32px; font-weight: 700;">${formattedAmount}</p>
                      </td></tr>
                      <tr><td style="padding-bottom: 12px;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">Submitted by</p>
                        <p style="margin: 4px 0 0; color: #1f2937; font-size: 16px; font-weight: 500;">${submitterName} (${submitterEmail})</p>
                      </td></tr>
                      <tr><td style="padding-bottom: 12px;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">Date</p>
                        <p style="margin: 4px 0 0; color: #1f2937; font-size: 16px;">${date}</p>
                      </td></tr>
                      <tr><td style="padding-bottom: 12px;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">Category</p>
                        <p style="margin: 4px 0 0; color: #1f2937; font-size: 16px;">${category}</p>
                      </td></tr>
                      <tr><td>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">Description</p>
                        <p style="margin: 4px 0 0; color: #1f2937; font-size: 16px;">${description}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
                ${receiptImageUrl ? `
                <tr>
                  <td style="padding: 0 24px 24px;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Receipt Image</p>
                    <img src="${receiptImageUrl}" alt="Receipt" style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e5e7eb;">
                  </td>
                </tr>
                ` : ""}
              </table>
              <table role="presentation" style="width: 100%; margin-bottom: 32px;">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <a href="${approveUrl}" class="button" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 12px;">
                      ✓ Approve Receipt
                    </a>
                    <a href="${rejectUrl}" class="button" style="display: inline-block; background-color: #ffffff; color: #dc2626; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #dc2626;">
                      ✕ Reject
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Or <a href="${reviewUrl}" style="color: #6366f1; text-decoration: underline;">review full details</a> in your Sutaeru dashboard.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
              <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0;">
                This is an automated message from Sutaeru Business. Receipt ID: ${receiptId}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Sutaeru. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `
Sutaeru Business - Receipt Review Required

Hello ${businessName} Team,

A new receipt has been submitted and requires your review.

RECEIPT DETAILS:
Amount: ${formattedAmount}
Submitted by: ${submitterName} (${submitterEmail})
Date: ${date}
Category: ${category}
Description: ${description}

ACTION REQUIRED:
Approve: ${approveUrl}
Reject: ${rejectUrl}
Review Details: ${reviewUrl}

Receipt ID: ${receiptId}
  `;

  return { subject, html, text };
}
