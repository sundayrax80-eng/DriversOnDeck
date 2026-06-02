const { json, parseBody, handleOptions } = require("./_shared/http");
const { pick, required } = require("./_shared/format");

function serializeError(error) {
    return {
          name: error?.name,
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          cause: error?.cause?.message || error?.cause
    };
}

function logError(message, details = {}) {
    console.error(message, {
          function: "contact",
          ...details
    });
}

function fail(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getSupabaseConfig() {
    if (!process.env.SUPABASE_URL) {
          throw fail(500, "Server is missing required environment variable: SUPABASE_URL");
    }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!serviceKey) {
          throw fail(500, "Server is missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
    }

  let url;
    try {
          url = new URL(process.env.SUPABASE_URL);
    } catch {
          throw fail(500, "SUPABASE_URL must be a valid URL");
    }

  if (url.protocol !== "https:") {
        throw fail(500, "SUPABASE_URL must start with https://");
  }

  return {
        restUrl: `${url.origin}/rest/v1`,
        serviceKey,
        keySource: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_SECRET_KEY"
  };
}

async function insertContactMessage(config, payload) {
    if (typeof fetch !== "function") {
          throw fail(500, "Netlify runtime fetch API is unavailable. Set the Netlify runtime to Node 18 or newer.");
    }

  const url = `${config.restUrl}/contact_messages?select=*`;

  try {
        const response = await fetch(url, {
                method: "POST",
                headers: {
                          apikey: config.serviceKey,
                          Authorization: `Bearer ${config.serviceKey}`,
                          "Content-Type": "application/json",
                          Prefer: "return=representation"
                },
                body: JSON.stringify(payload)
        });

      const responseText = await response.text();
        let responseBody = null;
        try {
                responseBody = responseText ? JSON.parse(responseText) : null;
        } catch {
                responseBody = { raw: responseText.slice(0, 500) };
        }

      if (!response.ok) {
              logError("contact Supabase REST insert returned an error", {
                        table: "contact_messages",
                        status: response.status,
                        statusText: response.statusText,
                        supabaseError: responseBody
              });
              const message = responseBody?.message || responseBody?.error || response.statusText || "Supabase insert failed";
              throw fail(500, `Supabase rejected contact message: ${message}`);
      }

      const rows = Array.isArray(responseBody) ? responseBody : [];
        if (!rows[0]) {
                logError("contact Supabase REST insert returned no row", {
                          table: "contact_messages",
                          responseBody
                });
                throw fail(500, "Supabase saved contact message but did not return a row");
        }

      return rows[0];
  } catch (error) {
        if (error.statusCode) throw error;

      logError("contact Supabase REST insert failed before receiving a response", {
              table: "contact_messages",
              error: serializeError(error)
      });
        throw fail(503, `Could not reach Supabase while saving contact message: ${error.message || "Unknown database error"}`);
  }
}

async function sendContactEmail(row) {
    if (!process.env.RESEND_API_KEY || !process.env.ADMIN_NOTIFICATION_EMAIL) {
          console.info("contact email skipped", {
                  function: "contact",
                  reason: !process.env.RESEND_API_KEY ? "Missing RESEND_API_KEY" : "Missing ADMIN_NOTIFICATION_EMAIL"
          });
          return { skipped: true };
    }

  try {
        const { Resend } = require("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        return await resend.emails.send({
                from: process.env.FROM_EMAIL || "Drivers On Deck Recruiting <onboarding@resend.dev>",
                to: process.env.ADMIN_NOTIFICATION_EMAIL,
                subject: `New Website Message - ${row.name}`,
                text: `Name: ${row.name}\nEmail: ${row.email}\nPhone: ${row.phone || ""}\nType: ${row.inquiry_type || ""}\n\n${row.message}`,
                html: `<h2>New Website Message</h2><p><strong>${row.name}</strong></p><p>${row.email}</p><p>${row.message}</p>`
        });
  } catch (error) {
        logError("contact Resend email failed but message was saved", {
                to: process.env.ADMIN_NOTIFICATION_EMAIL,
                error: serializeError(error)
        });
        return { skipped: false, error: error.message || "Email failed" };
  }
}

exports.handler = async (event) => {
    const options = handleOptions(event);
    if (options) return options;
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
          const supabaseConfig = getSupabaseConfig();
          console.info("contact starting request", {
                  function: "contact",
                  body: event.body ? "body-present" : "body-empty",
                  supabaseKeySource: supabaseConfig.keySource
          });

      const body = parseBody(event);
          const data = body.data || body;
          required(data, ["name", "email", "message"]);

      const payload = pick(data, ["name", "email", "phone", "inquiry_type", "message"]);
          const row = await insertContactMessage(supabaseConfig, payload);
          const email = await sendContactEmail(row);

      return json(200, { ok: true, record: row, email });
    } catch (error) {
          logError("contact failed", { error: serializeError(error) });
          return json(error.statusCode || 500, {
                  error: error.message || "Contact submission failed",
                  function: "contact"
          });
    }
};
