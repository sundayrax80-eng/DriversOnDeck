const { json, parseBody, handleOptions } = require("./_shared/http");
const { supabaseAdmin, sendMail } = require("./_shared/services");
const { pick, required } = require("./_shared/format");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const data = body.data || body;
    required(data, ["name", "email", "message"]);
    const payload = pick(data, ["name", "email", "phone", "inquiry_type", "message"]);
    const { data: row, error } = await supabaseAdmin().from("contact_messages").insert(payload).select("*").single();
    if (error) throw error;

    await sendMail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL,
      subject: `New Website Message - ${row.name}`,
      text: `Name: ${row.name}\nEmail: ${row.email}\nPhone: ${row.phone || ""}\nType: ${row.inquiry_type || ""}\n\n${row.message}`,
      html: `<h2>New Website Message</h2><p><strong>${row.name}</strong></p><p>${row.email}</p><p>${row.message}</p>`
    });

    return json(200, { ok: true, record: row });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Contact submission failed" });
  }
};
