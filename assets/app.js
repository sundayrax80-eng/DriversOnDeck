const STORE = {
  drivers: "rax_driver_leads",
  carriers: "rax_carrier_leads",
  jobOrders: "rax_job_orders",
  placements: "rax_placements",
  tasks: "rax_tasks",
  payments: "rax_payment_records",
  admin: "rax_admin_session"
};

const PAYMENT_PORTAL = {
  stripePaymentLinkUrl: "",
  providerName: "Stripe"
};

const API_BASE = "/.netlify/functions";
const ADMIN_TOKEN_KEY = "dod_admin_access_token";
let adminDataCache = null;

const STATUS = {
  drivers: ["new", "contacted", "qualified", "not_qualified", "submitted", "interviewing", "placed", "inactive"],
  carriers: ["new", "contacted", "agreement_sent", "active", "paused", "closed"],
  jobs: ["open", "recruiting", "interviews", "filled", "paused", "closed"],
  placements: ["submitted", "interviewing", "offered", "accepted", "started", "replacement_period", "closed", "failed"]
};

const disclaimer = "Drivers On Deck Recruiting is a driver recruiting and placement service. We are not a freight broker, motor carrier, dispatch company, employee leasing company, or professional employer organization. Final hiring decisions, official background checks, MVR checks, drug testing, Clearinghouse queries, and driver qualification file requirements remain the responsibility of the hiring carrier/client.";

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function addRecord(key, record) {
  const rows = readStore(key);
  rows.unshift(record);
  writeStore(key, rows);
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function backendLikelyAvailable() {
  return location.protocol !== "file:" && location.port !== "4173";
}

function setError(input, message) {
  const existing = input.closest(".field, label, fieldset")?.querySelector(".error");
  if (existing) existing.remove();
  if (!message) return;
  const p = document.createElement("div");
  p.className = "error";
  p.textContent = message;
  input.closest(".field, label, fieldset")?.appendChild(p);
}

function validPhone(value) {
  return value.replace(/\D/g, "").length >= 10;
}

function collectForm(form) {
  const data = {};
  const multi = {};
  new FormData(form).forEach((value, key) => {
    if (multi[key]) {
      multi[key].push(value);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      multi[key] = [data[key], value];
      delete data[key];
      return;
    }
    data[key] = value;
  });
  Object.assign(data, multi);
  return data;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function validate(form) {
  let ok = true;
  form.querySelectorAll(".error").forEach((node) => node.remove());
  form.querySelectorAll("[required]").forEach((input) => {
    const emptyCheckbox = input.type === "checkbox" && !input.checked;
    const emptyValue = input.type !== "checkbox" && !String(input.value || "").trim();
    if (emptyCheckbox || emptyValue) {
      setError(input, "Required");
      ok = false;
    }
  });
  form.querySelectorAll('input[type="email"]').forEach((input) => {
    if (input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
      setError(input, "Enter a valid email address");
      ok = false;
    }
  });
  form.querySelectorAll('input[type="tel"]').forEach((input) => {
    if (input.value && !validPhone(input.value)) {
      setError(input, "Enter a valid US phone number");
      ok = false;
    }
  });
  form.querySelectorAll('input[type="date"]').forEach((input) => {
    if (input.value && Number.isNaN(new Date(input.value).getTime())) {
      setError(input, "Enter a valid date");
      ok = false;
    }
  });
  return ok;
}

function notify(type, record) {
  const subject = type === "carrier"
    ? `New Carrier Lead - ${record.company_legal_name}`
    : `New CDL Driver Lead - ${record.full_name}`;
  const body = type === "carrier"
    ? `Contact: ${record.contact_person}\nPhone: ${record.phone}\nEmail: ${record.email}\nDriver needed: ${record.driver_type_needed}\nRoute: ${record.route_type}\nOpenings: ${record.number_of_openings}\nStart date: ${record.desired_start_date}\nDashboard record: /admin.html#${record.id}`
    : `CDL class: ${record.cdl_class}\nLocation: ${record.city}, ${record.state}\nEndorsements: ${(record.endorsements || []).join(", ")}\nExperience: ${record.years_experience}\nRoute preference: ${record.route_preference}\nAvailability: ${record.availability_date}\nDashboard record: /admin.html#${record.id}`;
  console.info("Email notification stub", { subject, body, record });
}

function setupNav() {
  const button = document.querySelector("[data-menu-button]");
  const links = document.querySelector("[data-nav-links]");
  if (!button || !links) return;
  button.addEventListener("click", () => links.classList.toggle("open"));
}

function setupForms() {
  document.querySelectorAll("form[data-lead-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validate(form)) return;
      const type = form.dataset.leadForm;
      const data = collectForm(form);
      const now = new Date().toISOString();
      const record = {
        id: uid(type),
        created_at: now,
        status: "new",
        internal_notes: "",
        last_contacted_at: "",
        ...data
      };

      if (type === "contact") {
        try {
          if (backendLikelyAvailable()) {
            await apiRequest("/contact", { body: { data } });
          }
        } catch (error) {
          console.warn("Contact backend unavailable; local preview only", error);
        }
        const success = form.querySelector(".success");
        if (success) {
          success.style.display = "block";
          success.focus();
        }
        form.reset();
        return;
      }

      if (type === "driver") {
        record.endorsements = asArray(data.endorsements);
        record.equipment_experience = asArray(data.equipment_experience);
        record.consent_to_share = data.consent_to_share === "on";
        try {
          if (backendLikelyAvailable()) {
            await apiRequest("/submit-lead", { body: { type: "driver", data: record } });
          } else {
            throw new Error("Local static preview");
          }
        } catch (error) {
          addRecord(STORE.drivers, record);
          notify("driver", record);
          console.warn("Driver lead saved locally because backend is unavailable", error);
        }
      }

      if (type === "carrier") {
        record.required_endorsements = asArray(data.required_endorsements);
        record.compliance_acknowledgment = data.compliance_acknowledgment === "on";
        try {
          if (backendLikelyAvailable()) {
            await apiRequest("/submit-lead", { body: { type: "carrier", data: record } });
          } else {
            throw new Error("Local static preview");
          }
        } catch (error) {
          addRecord(STORE.carriers, record);
          addRecord(STORE.jobOrders, {
            id: uid("job"),
            carrier_id: record.id,
            created_at: now,
            title: `${record.driver_type_needed} ${record.route_type} Driver - ${record.company_legal_name}`,
            driver_type_needed: record.driver_type_needed,
            route_type: record.route_type,
            equipment_type: record.equipment_type,
            pay_range: record.estimated_pay_range,
            number_of_openings: record.number_of_openings,
            required_endorsements: record.required_endorsements || [],
            minimum_experience: record.minimum_years_experience,
            start_date: record.desired_start_date,
            status: "open",
            internal_notes: ""
          });
          notify("carrier", record);
          console.warn("Carrier lead saved locally because backend is unavailable", error);
        }
      }

      const success = form.querySelector(".success");
      if (success) {
        success.style.display = "block";
        success.focus();
      }
      form.reset();
    });
  });
}

function setupPaymentPortal() {
  const form = document.querySelector("[data-payment-form]");
  if (!form) return;
  const status = document.querySelector("[data-payment-status]");
  if (PAYMENT_PORTAL.stripePaymentLinkUrl && status) {
    status.textContent = "Secure payment handoff is connected.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(form)) return;
    const data = collectForm(form);
    const record = {
      id: uid("payment"),
      created_at: new Date().toISOString(),
      company_name: data.company_name,
      email: data.email,
      invoice_reference: data.invoice_reference,
      amount: Number(data.amount || 0).toFixed(2),
      notes: data.notes || "",
      status: PAYMENT_PORTAL.stripePaymentLinkUrl ? "checkout_started" : "configuration_needed",
      provider: PAYMENT_PORTAL.providerName
    };

    const success = form.querySelector(".success");
    if (success) {
      success.style.display = "block";
      success.focus();
    }

    try {
      if (backendLikelyAvailable()) {
        const result = await apiRequest("/create-checkout-session", { body: { data: record } });
        if (result.url) {
          window.location.href = result.url;
          return;
        }
      } else {
        throw new Error("Local static preview");
      }
    } catch (error) {
      addRecord(STORE.payments, record);
      console.warn("Payment saved locally because checkout backend is unavailable", error);
    }

    if (!PAYMENT_PORTAL.stripePaymentLinkUrl) {
      if (status) {
        status.className = "payment-status error";
        status.textContent = "Payment backend is not connected in this local preview. Deploy with Stripe env vars before taking live payments.";
      }
      return;
    }

    const url = new URL(PAYMENT_PORTAL.stripePaymentLinkUrl);
    url.searchParams.set("client_reference_id", record.invoice_reference);
    url.searchParams.set("prefilled_email", record.email);
    window.location.href = url.toString();
  });
}

function seedIfEmpty() {
  if (readStore(STORE.drivers).length || readStore(STORE.carriers).length) return;
  const driver = {
    id: uid("driver"),
    created_at: new Date().toISOString(),
    full_name: "Maria Jenkins",
    preferred_name: "Maria",
    phone: "(214) 555-0182",
    email: "maria.driver@example.com",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    cdl_class: "Class A",
    cdl_state: "TX",
    cdl_expiration_date: "2028-05-12",
    medical_card_expiration_date: "2027-02-20",
    endorsements: ["Tanker", "TWIC"],
    years_experience: "6",
    equipment_experience: ["Container", "Dry Van"],
    transmission_restriction: "Manual capable",
    route_preference: "Local",
    desired_pay: "$30/hr",
    desired_schedule: "Home daily",
    availability_date: "2026-06-10",
    accident_history_notes: "No preventable accidents in last 3 years.",
    violation_history_notes: "Clean recent MVR per candidate self-report.",
    employment_history_notes: "Last 3 employers available on request.",
    consent_to_share: true,
    status: "qualified",
    internal_notes: "Strong drayage candidate.",
    last_contacted_at: "2026-05-20"
  };
  const carrier = {
    id: uid("carrier"),
    created_at: new Date().toISOString(),
    company_legal_name: "Lone Star Aggregate Hauling LLC",
    dba_name: "Lone Star Aggregate",
    contact_person: "Daniel Ortiz",
    contact_title: "Operations Manager",
    phone: "(512) 555-0175",
    email: "ops@examplecarrier.com",
    billing_address: "Austin, TX",
    dot_number: "1234567",
    mc_number: "",
    driver_type_needed: "Class B",
    route_type: "Local",
    home_time: "Home daily",
    number_of_openings: "2",
    desired_start_date: "2026-06-03",
    pay_structure: "Hourly",
    estimated_pay_range: "$24-$28/hr",
    employment_type: "W-2",
    equipment_type: "Dump",
    transmission_type: "Either",
    required_endorsements: ["None"],
    minimum_years_experience: "2",
    acceptable_accident_violation_limits: "Reviewed case by case.",
    background_process_notes: "Carrier runs MVR, drug test, and Clearinghouse query.",
    final_hiring_decision_person: "Daniel Ortiz",
    additional_job_details: "Construction hauling routes in Central Texas.",
    compliance_acknowledgment: true,
    status: "active",
    internal_notes: "Needs fast local candidates.",
    last_contacted_at: "2026-05-21"
  };
  writeStore(STORE.drivers, [driver]);
  writeStore(STORE.carriers, [carrier]);
  writeStore(STORE.jobOrders, [{
    id: uid("job"),
    carrier_id: carrier.id,
    created_at: new Date().toISOString(),
    title: "Class B Local Dump Driver - Lone Star Aggregate",
    driver_type_needed: "Class B",
    route_type: "Local",
    equipment_type: "Dump",
    pay_range: "$24-$28/hr",
    number_of_openings: "2",
    required_endorsements: ["None"],
    minimum_experience: "2",
    start_date: "2026-06-03",
    status: "recruiting",
    internal_notes: "Prioritize home-daily candidates."
  }]);
  writeStore(STORE.placements, []);
  writeStore(STORE.tasks, [{
    id: uid("task"),
    created_at: new Date().toISOString(),
    related_type: "carrier",
    related_id: carrier.id,
    title: "Send service agreement",
    due_date: "2026-05-29",
    status: "open",
    notes: "Confirm replacement period language."
  }]);
}

function fmt(value) {
  if (Array.isArray(value)) return value.map((item) => `<span class="badge">${item}</span>`).join("");
  return value || "-";
}

function optionList(options, selected) {
  return options.map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item.replaceAll("_", " ")}</option>`).join("");
}

function updateRecord(storeKey, id, patch) {
  const rows = readStore(storeKey).map((row) => row.id === id ? { ...row, ...patch } : row);
  writeStore(storeKey, rows);
}

function collectionFromStore(storeKey) {
  if (storeKey === STORE.drivers) return "drivers";
  if (storeKey === STORE.carriers) return "carriers";
  if (storeKey === STORE.jobOrders) return "jobs";
  if (storeKey === STORE.placements) return "placements";
  return "";
}

function filtersMatch(row, filters) {
  return Object.entries(filters).every(([key, value]) => {
    if (!value) return true;
    const raw = row[key];
    if (Array.isArray(raw)) return raw.join(" ").toLowerCase().includes(value.toLowerCase());
    return String(raw || "").toLowerCase().includes(value.toLowerCase());
  });
}

function renderTable(target, rows, columns, statusOptions, storeKey) {
  target.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join("")}<th>Notes</th><th>Actions</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${columns.map((col) => `<td>${fmt(row[col.key])}</td>`).join("")}
              <td><textarea data-note="${row.id}" rows="3">${row.internal_notes || ""}</textarea></td>
              <td>
                <select data-status="${row.id}">${optionList(statusOptions, row.status)}</select>
                <button class="button secondary" data-save="${row.id}" type="button">Save</button>
              </td>
            </tr>
          `).join("") || `<tr><td colspan="${columns.length + 2}">No records found.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  target.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.save;
      const status = target.querySelector(`[data-status="${id}"]`).value;
      const notes = target.querySelector(`[data-note="${id}"]`).value;
      const patch = { status, internal_notes: notes, last_contacted_at: new Date().toISOString().slice(0, 10) };
      const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
      if (token && backendLikelyAvailable()) {
        try {
          await apiRequest("/admin-update", {
            body: { collection: collectionFromStore(storeKey), id, ...patch },
            headers: { Authorization: `Bearer ${token}` }
          });
          await loadAdminData();
        } catch (error) {
          console.warn("Admin backend update failed; local update applied", error);
          updateRecord(storeKey, id, patch);
        }
      } else {
        updateRecord(storeKey, id, patch);
      }
      renderAdmin();
    });
  });
}

async function loadAdminData() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token || !backendLikelyAvailable()) return null;
  const result = await apiRequest("/admin-data", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  adminDataCache = result;
  return result;
}

function renderAdmin() {
  const root = document.querySelector("[data-admin-root]");
  if (!root) return;
  const view = root.dataset.view || "overview";
  const drivers = adminDataCache?.drivers || readStore(STORE.drivers);
  const carriers = adminDataCache?.carriers || readStore(STORE.carriers);
  const jobs = adminDataCache?.jobs || readStore(STORE.jobOrders);
  const placements = adminDataCache?.placements || readStore(STORE.placements);
  const tasks = adminDataCache?.tasks || readStore(STORE.tasks);
  const payments = adminDataCache?.payments || readStore(STORE.payments);
  const panel = document.querySelector("[data-admin-panel]");

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminView === view);
  });

  if (view === "overview") {
    panel.innerHTML = `
      <h2>Overview</h2>
      <div class="metrics">
        <div class="metric-card"><strong>${drivers.filter((r) => r.status === "new").length}</strong>New driver leads</div>
        <div class="metric-card"><strong>${drivers.filter((r) => r.status === "qualified").length}</strong>Qualified drivers</div>
        <div class="metric-card"><strong>${carriers.filter((r) => ["active", "new", "contacted"].includes(r.status)).length}</strong>Active carrier leads</div>
        <div class="metric-card"><strong>${jobs.filter((r) => ["open", "recruiting", "interviews"].includes(r.status)).length}</strong>Open job orders</div>
        <div class="metric-card"><strong>${placements.filter((r) => ["submitted", "interviewing", "offered", "accepted", "started"].includes(r.placement_status)).length}</strong>Pending placements</div>
        <div class="metric-card"><strong>${placements.filter((r) => r.invoice_status === "overdue").length}</strong>Overdue invoices</div>
      </div>
      <div class="card" style="margin-top:18px"><h3>Recent Payment Portal Activity</h3><ul class="list">${payments.slice(0, 5).map((payment) => `<li><strong>${payment.company_name}</strong> - $${payment.amount} for ${payment.invoice_reference} (${payment.status})</li>`).join("") || "<li>No payment activity yet.</li>"}</ul></div>
      <div class="card" style="margin-top:18px"><h3>Follow-up Tasks</h3><ul class="list">${tasks.map((task) => `<li><strong>${task.title}</strong> - ${task.due_date} (${task.status})</li>`).join("") || "<li>No tasks yet.</li>"}</ul></div>
    `;
  }

  if (view === "drivers") {
    panel.innerHTML = `<h2>Driver Leads</h2><div class="toolbar"><input placeholder="CDL class" data-filter="cdl_class"><input placeholder="State" data-filter="state"><input placeholder="Endorsement" data-filter="endorsements"><input placeholder="Status" data-filter="status"></div><div data-table></div>`;
    const draw = () => renderTable(panel.querySelector("[data-table]"), drivers.filter((row) => filtersMatch(row, currentFilters(panel))), [
      { label: "Name", key: "full_name" },
      { label: "CDL Class", key: "cdl_class" },
      { label: "City/State", key: "city" },
      { label: "Endorsements", key: "endorsements" },
      { label: "Experience", key: "years_experience" },
      { label: "Route", key: "route_preference" },
      { label: "Availability", key: "availability_date" },
      { label: "Status", key: "status" },
      { label: "Last Contacted", key: "last_contacted_at" }
    ], STATUS.drivers, STORE.drivers);
    panel.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("input", draw));
    draw();
  }

  if (view === "carriers") {
    panel.innerHTML = `<h2>Carrier Leads</h2><div class="toolbar"><input placeholder="Driver type" data-filter="driver_type_needed"><input placeholder="Route" data-filter="route_type"><input placeholder="Equipment" data-filter="equipment_type"><input placeholder="Status" data-filter="status"></div><div data-table></div>`;
    const draw = () => renderTable(panel.querySelector("[data-table]"), carriers.filter((row) => filtersMatch(row, currentFilters(panel))), [
      { label: "Company", key: "company_legal_name" },
      { label: "Contact", key: "contact_person" },
      { label: "Driver Needed", key: "driver_type_needed" },
      { label: "Route", key: "route_type" },
      { label: "Equipment", key: "equipment_type" },
      { label: "Openings", key: "number_of_openings" },
      { label: "Status", key: "status" },
      { label: "Last Contacted", key: "last_contacted_at" }
    ], STATUS.carriers, STORE.carriers);
    panel.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("input", draw));
    draw();
  }

  if (view === "jobs") {
    panel.innerHTML = `<h2>Job Orders</h2><div data-table></div>`;
    renderTable(panel.querySelector("[data-table]"), jobs, [
      { label: "Title", key: "title" },
      { label: "Driver Type", key: "driver_type_needed" },
      { label: "Route", key: "route_type" },
      { label: "Equipment", key: "equipment_type" },
      { label: "Pay Range", key: "pay_range" },
      { label: "Openings", key: "number_of_openings" },
      { label: "Status", key: "status" }
    ], STATUS.jobs, STORE.jobOrders);
  }

  if (view === "placements") {
    panel.innerHTML = `<h2>Placements</h2><p class="hint">Placement records can be connected to driver, carrier, and job order IDs when Supabase is enabled.</p><div data-table></div>`;
    renderTable(panel.querySelector("[data-table]"), placements, [
      { label: "Driver", key: "driver_id" },
      { label: "Carrier", key: "carrier_id" },
      { label: "Job Order", key: "job_order_id" },
      { label: "Start Date", key: "start_date" },
      { label: "Fee", key: "placement_fee" },
      { label: "Invoice", key: "invoice_status" },
      { label: "Status", key: "placement_status" },
      { label: "Guarantee End", key: "guarantee_end_date" }
    ], STATUS.placements, STORE.placements);
  }
}

function currentFilters(scope) {
  const filters = {};
  scope.querySelectorAll("[data-filter]").forEach((input) => {
    filters[input.dataset.filter] = input.value;
  });
  return filters;
}

function setupAdmin() {
  const root = document.querySelector("[data-admin-root]");
  if (!root) return;
  seedIfEmpty();
  const login = document.querySelector("[data-admin-login]");
  const app = document.querySelector("[data-admin-app]");
  const authed = sessionStorage.getItem(STORE.admin) === "true" || Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY));
  login.classList.toggle("hidden", authed);
  app.classList.toggle("hidden", !authed);

  login?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = login.querySelector("[name=email]")?.value;
    const password = login.querySelector("[name=password]").value;

    if (email && backendLikelyAvailable()) {
      try {
        const result = await apiRequest("/admin-login", { body: { email, password } });
        sessionStorage.setItem(ADMIN_TOKEN_KEY, result.access_token);
        login.classList.add("hidden");
        app.classList.remove("hidden");
        await loadAdminData();
        renderAdmin();
        return;
      } catch (error) {
        setError(login.querySelector("[name=password]"), error.message);
        return;
      }
    }

    if (password === "RaxAdmin2026!") {
      sessionStorage.setItem(STORE.admin, "true");
      login.classList.add("hidden");
      app.classList.remove("hidden");
      renderAdmin();
    } else {
      setError(login.querySelector("[name=password]"), "Use the demo password from the README or configure real auth.");
    }
  });

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => {
      root.dataset.view = button.dataset.adminView;
      renderAdmin();
    });
  });

  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    sessionStorage.removeItem(STORE.admin);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    location.reload();
  });

  if (authed) {
    loadAdminData().finally(renderAdmin);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupForms();
  setupPaymentPortal();
  setupAdmin();
  document.querySelectorAll("[data-disclaimer]").forEach((node) => {
    node.textContent = disclaimer;
  });
});
