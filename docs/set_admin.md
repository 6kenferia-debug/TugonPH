# Promote an Existing User to Admin

The application stores users in the MongoDB `TugonPH` database, in the Mongoose `users` collection. The `User` model's `role` field accepts `resident` or `admin`; new registrations default to `resident`. Express authorization grants admin access when the authenticated user's database record has `role: "admin"`.

There is no supported API endpoint or setup script for changing a user's role. The user-management API requires an existing admin and only permits changes to account status fields, so use MongoDB to promote the first admin.

Changing the role does not approve, activate, or verify an account. The application also requires an admin account to be active, approved, and email-verified before it can authenticate.

## Promote one account with `mongosh`

1. Ensure the Atlas cluster is running and the machine's public IP is allowed under Atlas Network Access.
2. In a terminal at the project root (`client`), start the backend and leave it running:

   ```bash
   npm run server
   ```

   The backend uses the Atlas connection string in `server/.env`. Do not share or print environment values.

3. Open a separate terminal and connect to that database:

   ```powershell
   $uriLine = Get-Content .\server\.env | Where-Object { $_ -match '^MONGODB_URI=' } | Select-Object -First 1
   if (-not $uriLine) { throw "MONGODB_URI is missing from server/.env." }
   $env:MONGODB_URI = $uriLine.Substring('MONGODB_URI='.Length)
   mongosh $env:MONGODB_URI
   Remove-Item Env:MONGODB_URI
   ```

   The connection string is read directly from the ignored environment file and is not printed. Keep it private.

4. Look up the account by its email address. The application stores emails in lowercase; use the account's actual email:

   ```javascript
   const email = "YOUR_EMAIL@example.com".trim().toLowerCase();
   const target = db.users.findOne(
     { email },
     { _id: 1, email: 1, name: 1, role: 1 }
   );
   printjson(target);
   ```

   Confirm that the returned name and email identify the intended account. If no account is returned or anything does not match, stop without making changes.

5. If the confirmed account's role is `resident`, update only that user's role:

   ```javascript
   if (!target || target.role !== "resident") {
     throw new Error("Expected the confirmed resident account; no change made.");
   }

   const result = db.users.updateOne(
     { _id: target._id, email: target.email, role: "resident" },
     { $set: { role: "admin" } }
   );

   if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
     throw new Error("Exactly one resident account was not updated; verify the account before continuing.");
   }
   ```

   If the account already has role `admin`, no update is needed.

6. Verify the role:

   ```javascript
   printjson(db.users.findOne(
     { _id: target._id },
     { _id: 1, email: 1, name: 1, role: 1 }
   ));
   ```

   Confirm the result shows `role: "admin"`.

7. Log out of the application and log back in with that account. Confirm the Admin Panel and admin features are available.
