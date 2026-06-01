const { json, handleOptions } = require("./_shared/http");
const { requireAdmin, supabaseAdmin } = require("./_shared/services");

async function getTable(db, table, order = "created_at") {
  const { data, error } = await db.from(table).select("*").order(order, { ascending: false });
  if (error) throw error;
  return data || [];
}

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    await requireAdmin(event);
    const db = supabaseAdmin();
    const [drivers, carriers, jobs, placements, tasks, payments] = await Promise.all([
      getTable(db, "driver_leads"),
      getTable(db, "carrier_leads"),
      getTable(db, "job_orders"),
      getTable(db, "placements"),
      getTable(db, "tasks"),
      getTable(db, "payment_records")
    ]);
    return json(200, { ok: true, drivers, carriers, jobs, placements, tasks, payments });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not load admin data" });
  }
};
