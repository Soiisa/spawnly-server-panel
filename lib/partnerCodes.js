// lib/partnerCodes.js
//
// Shared partner-code logic. Both purchase flows (one-time PaymentIntent and
// subscription Checkout) and the webhook that credits them import from here, so
// the bonus the buyer is quoted and the commission the partner earns can never
// drift apart.
//
// Server-side only -- every function here expects a service-role Supabase client.

export const normalizeCode = (code) => String(code || '').trim().toUpperCase();

/**
 * Look up an active partner code. Returns null for missing, blank or disabled
 * codes so callers can treat "no code" and "bad code" the same way.
 */
export async function lookupPartnerCode(supabaseAdmin, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  // Exact match, never ilike: SQL LIKE treats '%' and '_' as wildcards, so a
  // user typing '%' would match an arbitrary code and collect someone else's
  // bonus. Codes are stored upper-cased (see the admin create route) and the
  // unique index on upper(code) makes case collisions impossible.
  const { data, error } = await supabaseAdmin
    .from('partner_codes')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/** Extra credits the buyer gets for using the code, on top of any volume bonus. */
export function partnerBonusCredits(baseCredits, partner) {
  if (!partner) return 0;
  return Math.floor(Number(baseCredits) * (Number(partner.bonus_percent) / 100));
}

/** What the partner earns, as a share of what Stripe actually collected. */
export function commissionCents(netPaidCents, partner) {
  if (!partner) return 0;
  return Math.round(Number(netPaidCents) * (Number(partner.commission_percent) / 100));
}

/**
 * How many payments on this subscription have already earned commission.
 * Used to enforce max_commissioned_payments.
 */
export async function countCommissionedPayments(supabaseAdmin, subscriptionId) {
  if (!subscriptionId) return 0;
  const { count } = await supabaseAdmin
    .from('partner_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId);
  return count || 0;
}

/**
 * Record one credited payment against a partner code.
 *
 * Keyed on stripe_event_id, which is unique -- so a webhook retry hits the
 * constraint and is reported as a duplicate rather than paying the partner
 * twice. Never throws: attribution failing must not roll back a payment that
 * Stripe has already taken.
 */
export async function recordRedemption(supabaseAdmin, {
  partner, userId, stripeEventId, stripeObjectId, subscriptionId = null,
  kind, paymentIndex = 0, grossCents, netPaidCents, bonusCredits,
}) {
  if (!partner) return { recorded: false, reason: 'no_partner' };

  const commission = commissionCents(netPaidCents, partner);

  const { error } = await supabaseAdmin.from('partner_redemptions').insert({
    code_id: partner.id,
    user_id: userId,
    stripe_event_id: stripeEventId,
    stripe_object_id: stripeObjectId,
    subscription_id: subscriptionId,
    kind,
    payment_index: paymentIndex,
    gross_cents: Math.round(grossCents),
    net_paid_cents: Math.round(netPaidCents),
    bonus_credits: Math.round(bonusCredits),
    commission_cents: commission,
  });

  if (error) {
    // 23505 = unique_violation, i.e. we already processed this Stripe event.
    if (error.code === '23505') {
      console.log(`[Partner] Event ${stripeEventId} already recorded — skipping.`);
      return { recorded: false, reason: 'duplicate' };
    }
    console.warn(`[Partner] Failed to record redemption (non-fatal): ${error.message}`);
    return { recorded: false, reason: error.message };
  }

  console.log(
    `[Partner] ${partner.code}: ${kind} #${paymentIndex} — ` +
    `net €${(netPaidCents / 100).toFixed(2)}, commission €${(commission / 100).toFixed(2)}`
  );
  return { recorded: true, commissionCents: commission };
}
