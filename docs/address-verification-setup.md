# Registration Verification and Account Approval

TugonPH registration uses email OTP verification followed by admin approval. The registration flow does not request or store an identity document.

## Registration flow

1. The resident submits their name, email, password, and optional phone number to `POST /api/auth/register`.
2. The API creates an inactive resident account with `accountStatus: "pending"` and sends a six-digit email verification code.
# Registration Verification and Account Approval

This guide describes the current TugonPH registration flow. Registration does not include document uploads.

## Registration and email OTP

1. A resident submits their name, email, password, and optional phone number to `POST /api/auth/register`.
2. The API creates an inactive resident account with `accountStatus: "pending"` and sends a six-digit email verification code.
3. The resident submits the code to `POST /api/auth/verify-email`.
4. Email verification marks the email as verified; the account remains pending and inactive until an admin approves it.

Codes expire after 10 minutes. Resending is subject to a cooldown and a resend limit.

## Admin account approval

Admins review pending registrations in User Management and can approve or reject each account. The existing `PUT /api/admin/users/:userId/verify-address` endpoint is retained for compatibility with the current admin UI; it changes account status and activation and does not check an address or process an uploaded document.

Approval sets `accountStatus` to `approved` and `isActive` to `true`. Rejection sets `accountStatus` to `rejected` and records the admin's rejection reason. Residents can sign in after email verification and account approval.

## Related endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/register` | POST | Create a pending resident account and send an OTP |
| `/api/auth/verify-email` | POST | Verify the registration email |
| `/api/auth/resend-verification` | POST | Resend the email OTP subject to limits |
| `/api/auth/login` | POST | Sign in an eligible account |
| `/api/admin/users/:userId/verify-address` | PUT | Approve or reject an account using the existing admin UI contract |

Profile-picture and complaint/assistance resolution-proof uploads are separate features and are not part of registration.
