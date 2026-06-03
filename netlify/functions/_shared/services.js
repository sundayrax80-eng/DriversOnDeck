const { createClient } = require("@supabase/supabase-js");

function requireEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function requireAnyEnv(names) {
    const found = names.find((name) => process.env[name]);
    if (!found) throw new Error(`Missing one of: ${names.join(", ")}`);
    return process.env[found];
}

function supabaseAdmin() {
    return createClient(requireEnv("SUPABASE_URL"), requireAnyEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]), {
          auth: { persistSession: false }
    });
}

function supabaseAnon() {
    return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
          auth: { persistSession: false }
    });
}

function adminEmails() {
    return (process.env.ADMIN_EMAILS || process.env.ADMIN_NOTIFICATION_EMAIL || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
}

async function requireAdmin(event) {
    const auth = event.headers.authorization || event.headers.Authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
          const error = new Error("Missing admin token");
          error.statusCode = 401;
          throw error;
    }

  const client = supabaseAnon();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
          const err = new Error("Invalid admin token");
          err.statusCode = 401;
          throw err;
    }

  const email = String(data.user.email || "").toLowerCase();
    if (!adminEmails().includes(email)) {
          const err = new Error("This user is not listed in ADMIN_EMAILS");
          err.statusCode = 403;
          throw err;
    }

  return data.user;
}

async function sendMail({ to, subject, html, text }) {
    if (!process.env.RESEND_API_KEY || !to) return { skipped: true };
    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    return resend.emails.send({
          from: process.env.FROM_EMAIL || "Drivers On Deck Recruiting <onboarding@resend.dev>",
          to,
          subject,
          html,
          text
    });
}

module.exports = { requireEnv, requireAnyEnv, supabaseAdmin, supabaseAnon, requireAdmin, sendMail, adminEmails };
