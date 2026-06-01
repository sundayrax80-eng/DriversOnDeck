const { json, parseBody, handleOptions } = require("./_shared/http");
const { requireEnv, supabaseAdmin } = require("./_shared/services");
const { moneyToCents, pick, required } = require("./_shared/format");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const data = body.data || body;
    required(data, ["company_name", "email", "invoice_reference", "amount"]);

    const amount = Number(data.amount);
    const db = supabaseAdmin();
    const { data: payment, error } = await db.from("payment_records").insert({
      ...pick(data, ["company_name", "email", "invoice_reference", "notes"]),
      amount,
      status: "checkout_started",
      provider: "stripe"
    }).select("*").single();
    if (error) throw error;

    if (process.env.STRIPE_PAYMENT_LINK_URL) {
      const url = new URL(process.env.STRIPE_PAYMENT_LINK_URL);
      url.searchParams.set("client_reference_id", payment.invoice_reference);
      url.searchParams.set("prefilled_email", payment.email);
      return json(200, { ok: true, url: url.toString(), record: payment });
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
    const publicUrl = requireEnv("PUBLIC_SITE_URL").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: payment.email,
      client_reference_id: payment.invoice_reference,
      success_url: `${publicUrl}/payments.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/payments.html?payment=cancelled`,
      metadata: {
        payment_record_id: payment.id,
        company_name: payment.company_name,
        invoice_reference: payment.invoice_reference
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: moneyToCents(amount),
          product_data: {
            name: "Drivers On Deck Recruiting placement fee",
            description: payment.invoice_reference
          }
        }
      }]
    });

    await db.from("payment_records").update({ stripe_checkout_session_id: session.id }).eq("id", payment.id);
    return json(200, { ok: true, url: session.url, record: payment });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Payment session failed" });
  }
};
