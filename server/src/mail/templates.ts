import type { Email } from "./Mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#191813">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#fffdf7;border:1px solid #d6d0bf;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:22px">CourseBox</p>
${body}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#85816f">You're receiving this because of activity on your CourseBox account.</p>
</td></tr></table></body></html>`;
}

export function resetCodeEmail(to: string, username: string, code: string, minutes: number): Email {
  return {
    to,
    subject: `${code} is your CourseBox reset code`,
    text: [
      `Hi ${username},`,
      "",
      `Your code to reset your CourseBox password is: ${code}`,
      "",
      `It expires in ${minutes} minutes and can be used once.`,
      "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ].join("\n"),
    html: layout(`<p style="margin:0 0 16px;font-size:15px">Hi ${esc(username)},</p>
<p style="margin:0 0 16px;font-size:15px">Use this code to reset your CourseBox password:</p>
<p style="margin:0 0 16px;font-family:Menlo,Consolas,monospace;font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p>
<p style="margin:0 0 16px;font-size:14px;color:#4f4c43">It expires in ${minutes} minutes and can be used once.</p>
<p style="margin:0;font-size:13px;color:#85816f">If you didn't ask to reset your password, ignore this email. Your password stays the same.</p>`),
  };
}

export function passwordChangedEmail(to: string, username: string, how: "reset" | "change"): Email {
  const what = how === "reset" ? "was reset with an emailed code" : "was changed from your account settings";
  return {
    to,
    subject: "Your CourseBox password was changed",
    text: [
      `Hi ${username},`,
      "",
      `Your CourseBox password ${what}. You've been signed out on your other devices.`,
      "",
      "If this wasn't you, reset your password right away from the sign-in screen (\"Forgot password?\").",
    ].join("\n"),
    html: layout(`<p style="margin:0 0 16px;font-size:15px">Hi ${esc(username)},</p>
<p style="margin:0 0 16px;font-size:15px">Your CourseBox password ${what}. You've been signed out on your other devices.</p>
<p style="margin:0;font-size:13px;color:#85816f">If this wasn't you, reset your password right away from the sign-in screen ("Forgot password?").</p>`),
  };
}
