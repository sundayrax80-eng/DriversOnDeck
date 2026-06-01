const { json, parseBody, handleOptions } = require("./_shared/http");
const { supabaseAdmin, sendMail } = require("./_shared/services");
const { asArray, pick, required } = require("./_shared/format");

const driverKeys = [
  "full_name", "preferred_name", "phone", "email", "city", "state", "zip", "cdl_class",
  "cdl_state", "cdl_expiration_date", "medical_card_expiration_date", "years_experience",
  "transmission_restriction", "route_preference", "desired_pay", "desired_schedule",
  "availability_date", "accident_history_notes", "violation_history_notes", "employment_history_notes"
];

const carrierKeys = [
  "company_legal_name", "dba_name", "contact_person", "contact_title", "phone", "email",
  "billing_address", "dot_number", "mc_number", "driver_type_needed", "route_type", "home_time",
  "number_of_openings", "desired_start_date", "pay_structure", "estimated_pay_range",
  "employment_type", "equipment_type", "transmission_type", "minimum_years_experience",
  "acceptable_accident_violation_limits", "background_process_notes",
  "final_hiring_decision_person", "additional_job_details"
];

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

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

function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function checkEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    throw fail(500, `Server is missing required environment variable(s): ${missing.join(", ")}`);
  }
}

async function insertSingle(db, table, payload, label) {
  try {
    const { data, error } = await db.from(table).insert(payload).select("*").single();
    if (error) {
      console.error("submit-lead Supabase insert returned an error", {
        table,
        label,
        error: serializeError(error)
      });
      throw error;
    }
    return data;
  } catch (error) {
    console.error("submit-lead Supabase insert failed", {
      table,
      label,
      error: serializeError(error)
    });
    throw fail(502, `Supabase insert failed for ${label}: ${error.message || "Unknown database error"}`);
  }
}

async function sendLeadEmail(email) {
  try {
    const result = await sendMail(email);
    if (result?.skipped) {
      console.info("submit-lead email skipped", {
        subject: email.subject,
        reason: !process.env.RESEND_API_KEY ? "Missing RESEND_API_KEY" : "Missing recipient"
      });
    }
    return result;
  } catch (error) {
    console.error("submit-lead email failed but lead was saved", {
      to: email.to,
      subject: email.subject,
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
    checkEnv();
    const body = parseBody(event);
    const type = body.type;
    const data = body.data || {};
    const db = supabaseAdmin();

    if (type === "driver") {
      required(data, ["full_name", "phone", "email", "city", "state", "zip", "cdl_class", "cdl_state"]);
      const payload = {
        ...pick(data, driverKeys),
        endorsements: asArray(data.endorsements),
        equipment_experience: asArray(data.equipment_experience),
        consent_to_share: Boolean(data.consent_to_share),
        status: "new"
      };
      if (!payload.consent_to_share) return json(400, { error: "Driver consent is required" });

      const row = await insertSingle(db, "driver_leads", payload, "driver lead");

      const adminEmail = await sendLeadEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: `New CDL Driver Lead - ${row.full_name}`,
        text: `CDL class: ${row.cdl_class}\nLocation: ${row.city}, ${row.state}\nEndorsements: ${(row.endorsements || []).join(", ")}\nExperience: ${row.years_experience || ""}\nRoute preference: ${row.route_preference || ""}\nAvailability: ${row.availability_date || ""}`,
        html: `<h2>New CDL Driver Lead</h2><p><strong>${row.full_name}</strong></p><p>${row.city}, ${row.state}</p><p>CDL: ${row.cdl_class}</p><p>Route: ${row.route_preference || "Not provided"}</p>`
      });
      const confirmationEmail = await sendLeadEmail({
        to: row.email,
        subject: "We received your driver interest form",
        text: "Thanks for submitting your driver interest form. We may contact you if your experience lines up with a carrier opportunity.",
        html: "<p>Thanks for submitting your driver interest form. We may contact you if your experience lines up with a carrier opportunity.</p>"
      });

      return json(200, { ok: true, record: row, email: { admin: adminEmail, confirmation: confirmationEmail } });
    }

    if (type === "carrier") {
      required(data, ["company_legal_name", "contact_person", "phone", "email", "driver_type_needed", "route_type"]);
      const payload = {
        ...pick(data, carrierKeys),
        number_of_openings: data.number_of_openings ? Number(data.number_of_openings) : null,
        required_endorsements: asArray(data.required_endorsements),
        compliance_acknowledgment: Boolean(data.compliance_acknowledgment),
        status: "new"
      };
      if (!payload.compliance_acknowledgment) return json(400, { error: "Carrier acknowledgment is required" });

      const row = await insertSingle(db, "carrier_leads", payload, "carrier lead");

      const jobPayload = {
        carrier_id: row.id,
        title: `${row.driver_type_needed} ${row.route_type} Driver - ${row.company_legal_name}`,
        driver_type_needed: row.driver_type_needed,
        route_type: row.route_type,
        equipment_type: row.equipment_type,
        pay_range: row.estimated_pay_range,
        number_of_openings: row.number_of_openings,
        required_endorsements: row.required_endorsements || [],
        minimum_experience: row.minimum_years_experience,
        start_date: row.desired_start_date,
        status: "open"
      };
      const jobOrder = await insertSingle(db, "job_orders", jobPayload, "job order");

      const adminEmail = await sendLeadEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: `New Carrier Lead - ${row.company_legal_name}`,
        text: `Contact: ${row.contact_person}\nPhone: ${row.phone}\nEmail: ${row.email}\nDriver needed: ${row.driver_type_needed}\nRoute: ${row.route_type}\nOpenings: ${row.number_of_openings || ""}\nStart date: ${row.desired_start_date || ""}`,
        html: `<h2>New Carrier Lead</h2><p><strong>${row.company_legal_name}</strong></p><p>Contact: ${row.contact_person}</p><p>Need: ${row.driver_type_needed} / ${row.route_type}</p>`
      });
      const confirmationEmail = await sendLeadEmail({
        to: row.email,
        subject: "We received your driver request",
        text: "Thanks for requesting CDL driver recruiting support. We will follow up to review your hiring need.",
        html: "<p>Thanks for requesting CDL driver recruiting support. We will follow up to review your hiring need.</p>"
      });

      return json(200, { ok: true, record: row, jobOrder, email: { admin: adminEmail, confirmation: confirmationEmail } });
    }

    return json(400, { error: "Unsupported lead type" });
  } catch (error) {
    console.error("submit-lead failed", { error: serializeError(error) });
    return json(error.statusCode || 500, {
      error: error.message || "Lead submission failed",
      function: "submit-lead"
    });
  }
};
