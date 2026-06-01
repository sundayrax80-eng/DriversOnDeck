const { json, parseBody, handleOptions } = require("./_shared/http");
const { supabaseAnon, adminEmails } = require("./_shared/services");
const { required } = require("./_shared/format");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    required(body, ["email", "password"]);
    const { data, error } = await supabaseAnon().auth.signInWithPassword({
      email: body.email,
      password: body.password
    });
    if (error) throw error;

    const email = String(data.user.email || "").toLowerCase();
    if (!adminEmails().includes(email)) {
      return json(403, { error: "This user is not listed in ADMIN_EMAILS" });
    }

    return json(200, {
      ok: true,
      access_token: data.session.access_token,
      user: { id: data.user.id, email: data.user.email }
    });
  } catch (error) {
    return json(error.statusCode || 401, { error: error.message || "Admin login failed" });
  }
};
