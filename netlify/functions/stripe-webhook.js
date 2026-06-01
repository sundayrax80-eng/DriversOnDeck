const { json } = require("./_shared/http");
const { requireEnv, supabaseAdmin } = require("./_shared/services");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
    const signature = event.headers["stripe-signature"];
    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const paymentRecordId = session.metadata && session.metadata.payment_record_id;
      if (paymentRecordId) {
        await supabaseAdmin().from("payment_records").update({
          status: "paid",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null
        }).eq("id", paymentRecordId);
      }
    }

    return json(200, { received: true });
  } catch (error) {
    return json(400, { error: error.message || "Webhook failed" });
  }
};
