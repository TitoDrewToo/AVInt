# Firm partnership operations

## Provisioning

An AVIntelligence system administrator provisions firms through protected `POST /api/internal/firms`. Authenticate with a Supabase access token belonging to a user in `system_admins`. Use either an existing `admin_user_id` or an `admin_email`; the email path sends Supabase’s invitation email and links the invited user to `firm_admins`.

## Creem seat product

In Creem, create a private annual client-seat product priced at $100 per unit. Do not add it to public pricing. Configure:

```text
CREEM_FIRM_SEAT_PRODUCT_ID=<private Creem product id>
FIRM_PARTNER_RATE_CENTS=10000
```

The firm checkout sends `units` and `{ firm_id }` metadata. The webhook records `firm_seat_purchases` and increments `firms.seats_purchased` through an idempotent RPC. Re-delivered event IDs do not add seats twice.

## URLs

- Client intake: `/partner/{slug}`
- Firm dashboard: `/partner/{slug}/dashboard`

## Security review

- `firms`, `firm_admins`, `firm_clients`, and the purchase ledger have RLS enabled; anonymous users cannot read them.
- Membership is evaluated server-side from the verified Supabase token. Request bodies never supply the authoritative user ID.
- Enrollment locks the firm row before checking capacity and increments `seats_used` in the same transaction.
- Dashboard and export routes verify the requesting user is an admin of the firm, then require the target user to be enrolled in that same firm.
- Service-role data access happens only after those checks; changing a slug or user ID cannot cross the firm boundary.
- Firm-client access expires one year after enrollment and resolves as a Pro-equivalent entitlement; individual subscriptions remain unchanged.
