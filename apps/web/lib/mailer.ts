/**
 * Minimal Resend mailer. Returns false (and logs the link) when RESEND_API_KEY
 * isn't configured, so every flow works copy/paste-first and upgrades to email
 * automatically once the key is set on Railway.
 */
export async function sendInviteEmail(input: {
  to: string;
  orgName: string;
  eventTitle?: string;
  url: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail disabled] invite for ${input.to}: ${input.url}`);
    return false;
  }

  const subject = input.eventTitle
    ? `${input.orgName} — complete your intake for ${input.eventTitle}`
    : `${input.orgName} — complete your intake`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Vitalgather <onboarding@resend.dev>",
      to: input.to,
      subject,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1c1917">${escapeHtml(input.orgName)} invited you</h2>
          <p style="color:#57534e;line-height:1.6">
            ${input.eventTitle ? `You're registered for <strong>${escapeHtml(input.eventTitle)}</strong>. ` : ""}
            Tap the button below to confirm your details and complete your intake form.
          </p>
          <a href="${input.url}"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;
                    border-radius:12px;text-decoration:none;font-weight:600">
            Complete my intake
          </a>
          <p style="color:#a8a29e;font-size:12px;margin-top:24px">
            This link is personal to you and expires in 30 days.
          </p>
        </div>`,
    }),
  });

  return res.ok;
}

/**
 * Notify a teammate they've been invited to help run an org. There's no token
 * link — the invite is bound to their email and shows up in their dashboard
 * once they sign in, so the email just points them to sign in.
 */
export async function sendMemberInviteEmail(input: {
  to: string;
  orgName: string;
  role: string;
  url: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail disabled] team invite for ${input.to} → ${input.url}`);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Vitalgather <onboarding@resend.dev>",
      to: input.to,
      subject: `${input.orgName} invited you to their team on Vitalgather`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1c1917">${escapeHtml(input.orgName)} invited you</h2>
          <p style="color:#57534e;line-height:1.6">
            You've been invited to help run <strong>${escapeHtml(input.orgName)}</strong>
            as ${escapeHtml(input.role.toLowerCase())}. Sign in with this email and
            accept the invite from your dashboard to get started.
          </p>
          <a href="${input.url}"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;
                    border-radius:12px;text-decoration:none;font-weight:600">
            Sign in to accept
          </a>
          <p style="color:#a8a29e;font-size:12px;margin-top:24px">
            Didn't expect this? You can safely ignore it — nothing happens until
            you accept.
          </p>
        </div>`,
    }),
  });

  return res.ok;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
