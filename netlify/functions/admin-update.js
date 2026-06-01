const { json, parseBody, handleOptions } = require("./_shared/http");
const { requireAdmin, supabaseAdmin } = require("./_shared/services");
const { required } = require("./_shared/format");

const tables = {
  drivers: "driver_leads",
  carriers: "carrier_leads",
  jobs: "job_orders",
  placements: "placements",
  tasks: "tasks"
};

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    await requireAdmin(event);
    const body = parseBody(event);
    required(body, ["collection", "id"]);
    const table = tables[body.collection];
    if (!table) return json(400, { error: "Unsupported collection" });

    const patch = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.internal_notes !== undefined) patch.internal_notes = body.internal_notes;
    if (["drivers", "carriers"].includes(body.collection)) {
      patch.last_contacted_at = new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await supabaseAdmin().from(table).update(patch).eq("id", body.id).select("*").single();
    if (error) throw error;
    return json(200, { ok: true, record: data });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Update failed" });
  }
};
