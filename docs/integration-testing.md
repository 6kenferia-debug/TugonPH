# Integration Mapping and Test Plan

## Request change data mapping

| Source system | Source field | Target system | Target field | Data type | Transformation / rule |
| --- | --- | --- | --- | --- | --- |
| MongoDB, after a request change | Record ID (`_id`) | React app through authenticated REST polling | `id` | String | The polling API converts MongoDB `_id` to a string. The client compares IDs in successive snapshots to detect created and deleted requests. |
| MongoDB, after a request change | `userId` | React app through authenticated REST polling | `userId` | String or null | The polling API converts a non-null user ID to a string and preserves null. Residents are scoped to their own requests by the API; admins can poll all requests. |
| MongoDB, after a request change | `updatedAt` | React app through authenticated REST polling | `updatedAt` | ISO 8601 string | The polling API returns the timestamp. The client compares it with its previous snapshot to detect updates. On a detected change, the app fetches the request data from the REST API. |

The app polls the complaints and assistance-request endpoints every seven seconds with the user's JWT. Polling responses identify changes; they do not carry full request records or trigger Socket.IO events. There are no Socket.IO rooms or direct server pushes. MongoDB and REST remain the source of truth.

## Integration scenario

6. The API saves the request in MongoDB and returns the saved request to the submitting app. Subsequent authenticated polling detects the change and causes the relevant resident or admin screen to refresh request data through the REST API. Resident polling is scoped to that resident; admin polling includes all requests.

## Risk register

| Risk | Likelihood | Impact | Severity | Control |
| --- | --- | --- | --- | --- |
| A polling or API failure could delay request updates in the app. | Medium | Medium | Medium | Keep MongoDB and REST responses as the source of truth. Polling retries on its next interval; refresh request data after polling recovers or the user reconnects. |

## Integration test plan

Check that the React app, Express API, and MongoDB exchange and save request data correctly. Check that authenticated polling detects request changes and refreshes the correct resident and admin screens without a page reload, status emails reach registered users, and resolution proof files are stored and linked to their records.

## Integration test cases

| Test ID | Integration flow | Test scenario | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- | --- |
| I-10 | Frontend -> API -> Database -> polling API -> Frontend | Polling-based request update checking | Updated information becomes visible without a page reload after the polling cycle detects a change. | The app polls the authenticated REST endpoints every seven seconds; changed request data is reloaded from the REST API instead of using Socket.IO or WebSockets. End-to-end verification is still needed. | PARTIAL |

## Password recovery and change testing

Use an approved, email-verified test account and a non-production MongoDB database. Configure Gmail SMTP using the documented `server/.env` settings without sharing credentials. Do not use real user accounts or record passwords, OTP values, recovery tokens, or SMTP secrets in test output.

| Flow | Test scenario | Expected result |
| --- | --- | --- |
| Forgot password | Request recovery for an existing and a non-existing email | Both requests return the same generic message; only the verified account receives a recovery OTP. |
| Forgot password | Enter an incorrect OTP, an expired OTP, or reuse an already-verified OTP | The API rejects the attempt; expired, exhausted, and already-used codes cannot reset the password. |
| Forgot password | Request another OTP before the cooldown or after the resend limit | No additional email is sent during the cooldown or after the per-window limit. |
| Forgot password | Submit a weak or mismatched new password | The password remains unchanged and the UI displays the validation error. |
| Forgot password | Complete OTP verification and submit a valid new password | The reset token is single-use, the password is updated, the user remains logged out, and the UI returns to login after about two seconds. |
| Change password | Submit a wrong current password, weak password, mismatch, or the current password as the new password | The password is unchanged and an appropriate error is shown. |
| Change password | Submit valid current and new passwords as a resident and as an admin | Only the authenticated account's password changes; the session remains authenticated and no OTP email is sent. |
| Change password | Log out after a successful change and test both credentials | The new password works and the old password no longer works. |
