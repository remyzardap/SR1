/**
 * Procurement email templates for approval/rejection notifications
 */

export interface ProcurementEmailData {
  businessName: string;
  requesterName: string;
  requesterEmail: string;
  description: string;
  quantity: number;
  totalBudget?: string;
  currency: string;
  vendorName?: string;
  location?: string;
  approvalNote?: string;
  procurementId: number;
  dashboardUrl: string;
}

export function generateProcurementApprovedEmail(data: ProcurementEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `✅ Procurement Request Approved — ${data.businessName}`;
  const formattedBudget = data.totalBudget
    ? `${data.currency} ${parseFloat(data.totalBudget).toLocaleString()}`
    : "—";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Sutaeru Business</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Procurement Management</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; background-color: #d1fae5; border-radius: 50%; width: 64px; height: 64px; line-height: 64px; font-size: 32px; margin-bottom: 16px;">✅</div>
                <h2 style="margin: 0; color: #1f2937; font-size: 22px; font-weight: 700;">Request Approved!</h2>
                <p style="margin: 8px 0 0; color: #6b7280; font-size: 15px;">Your procurement request has been approved.</p>
              </div>

              <!-- Details Card -->
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="margin: 0 0 16px; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Request Details</p>
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 40%;">Description</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.description}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Quantity</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.quantity}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Budget</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${formattedBudget}</td>
                      </tr>
                      ${data.vendorName ? `
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Vendor</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.vendorName}</td>
                      </tr>
                      ` : ""}
                      ${data.location ? `
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Location</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.location}</td>
                      </tr>
                      ` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              ${data.approvalNote ? `
              <table role="presentation" style="width: 100%; background-color: #ecfdf5; border-radius: 8px; margin-bottom: 24px; border: 1px solid #a7f3d0;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px; color: #065f46; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Approval Note</p>
                    <p style="margin: 0; color: #064e3b; font-size: 14px; line-height: 1.6;">${data.approvalNote}</p>
                  </td>
                </tr>
              </table>
              ` : ""}

              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${data.dashboardUrl}/procurement" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                  View in Dashboard →
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 24px;">
              <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                This is an automated message from Sutaeru Business. Procurement ID: #${data.procurementId}.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Sutaeru. All rights reserved.</p>
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
Sutaeru Business — Procurement Request Approved

Hi ${data.requesterName},

Your procurement request has been approved!

DETAILS:
Description: ${data.description}
Quantity: ${data.quantity}
Budget: ${formattedBudget}
${data.vendorName ? `Vendor: ${data.vendorName}` : ""}
${data.location ? `Location: ${data.location}` : ""}
${data.approvalNote ? `\nApproval Note: ${data.approvalNote}` : ""}

View in Dashboard: ${data.dashboardUrl}/procurement

Procurement ID: #${data.procurementId}
  `.trim();

  return { subject, html, text };
}

export function generateProcurementRejectedEmail(data: ProcurementEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `❌ Procurement Request Rejected — ${data.businessName}`;
  const formattedBudget = data.totalBudget
    ? `${data.currency} ${parseFloat(data.totalBudget).toLocaleString()}`
    : "—";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Sutaeru Business</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Procurement Management</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; background-color: #fee2e2; border-radius: 50%; width: 64px; height: 64px; line-height: 64px; font-size: 32px; margin-bottom: 16px;">❌</div>
                <h2 style="margin: 0; color: #1f2937; font-size: 22px; font-weight: 700;">Request Not Approved</h2>
                <p style="margin: 8px 0 0; color: #6b7280; font-size: 15px;">Your procurement request was not approved at this time.</p>
              </div>

              <!-- Details Card -->
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="margin: 0 0 16px; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Request Details</p>
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 40%;">Description</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.description}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Quantity</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${data.quantity}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Budget</td>
                        <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 500;">${formattedBudget}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${data.approvalNote ? `
              <table role="presentation" style="width: 100%; background-color: #fef2f2; border-radius: 8px; margin-bottom: 24px; border: 1px solid #fecaca;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px; color: #991b1b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Reason</p>
                    <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">${data.approvalNote}</p>
                  </td>
                </tr>
              </table>
              ` : ""}

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                You may submit a revised request with updated details. If you have questions, please contact your business administrator.
              </p>

              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${data.dashboardUrl}/procurement" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                  View in Dashboard →
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 24px;">
              <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                This is an automated message from Sutaeru Business. Procurement ID: #${data.procurementId}.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Sutaeru. All rights reserved.</p>
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
Sutaeru Business — Procurement Request Not Approved

Hi ${data.requesterName},

Unfortunately, your procurement request was not approved at this time.

DETAILS:
Description: ${data.description}
Quantity: ${data.quantity}
Budget: ${formattedBudget}
${data.approvalNote ? `\nReason: ${data.approvalNote}` : ""}

You may submit a revised request with updated details.

View in Dashboard: ${data.dashboardUrl}/procurement

Procurement ID: #${data.procurementId}
  `.trim();

  return { subject, html, text };
}
