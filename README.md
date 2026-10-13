# TugonPH

TugonPH is a barangay service system made for fast and clear public service. It helps residents and guests send complaints or requests for help. It also helps admins review requests, verify users, check reports, and manage service records.

This project uses React, TypeScript, Vite, Express, MongoDB, and JWT for secure access.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-TugonPH-47A248.svg)

## What this app does

TugonPH is built to make barangay services easier to handle. It helps people report problems and ask for support. It also gives admins a clean place to manage requests, monitor activity, and review records.

## Main features

### For residents

- **Send complaints** - Report barangay concerns with a photo, valid contact number, and optional location pin.
- **Send assistance requests** - Ask for help with health needs, emergency support, food, burial, financial aid, scholarship help, and other barangay-related needs.
- **View all requests in one place** - Check your complaints and assistance requests in one dashboard.
- **Track status** - See whether a request is pending, in progress, resolved, or rejected.
- **Read notifications** - Get updates on request activity and see which messages are read or unread.
- **Manage profile** - Update your account details, email settings, password, and access information.

### For guests

- **Submit without an account** - Guests can send a complaint or request without creating a profile.
- **Use anonymous labels** - Guest submissions are tagged with generated names like `Anonymous001`.
- **Follow same rules** - Guests must still provide valid proof and a correct 11-digit phone number.

### For admins

- **Manage requests** - Review, filter, sort, update, and delete valid entries when needed.
- **Approve accounts** - Review new accounts after email verification.
- **Use heatmap data** - View complaint and assistance locations in one map view.
- **Check analytics** - Study patterns, status counts, categories, and trends. Export data as CSV when needed.
- **Manage users** - Handle residents, permissions, and account verification.

### General features

- **Role-based access** - Residents, guests, and admins each have different permissions.
- **Approval before access** - New verified accounts stay pending until an admin approves them.
- **Strong contact validation** - Phone numbers are checked and saved as valid 11-digit numbers.
- **Auto update system** - The app checks for request changes and refreshes related data when needed.
- **Works on desktop and mobile** - The interface is designed to fit both small and large screens.

## Tech stack

### Frontend

- **React 18.3.1** - UI library
- **TypeScript** - Safer JavaScript with clear types
- **Vite 6** - Fast development and build tool
- **Tailwind CSS** - Simple and flexible styling
- **Radix UI** - Access-friendly UI components
- **Lucide React** - Icons
- **Recharts** - Charts and analytics
- **Leaflet and leaflet.heat** - Maps and heatmap display
- **React Hook Form** - Form handling and validation
- **Sonner** - Toast notifications

### Backend and database

- **Express and Mongoose** - API layer and MongoDB connection
- **Polling** - Checks for request updates through the API
- **Image storage** - Profile pictures and proof images use local storage in development and Vercel Blob in deployment

## Requirements

- **Node.js** version 20 or higher
- **npm**, **yarn**, or **pnpm**
- A MongoDB Atlas account, database user, and access to your current IP

## Deploy to Vercel

The frontend and backend are planned to work as one Vercel project. The API runs under `/api`, and uploaded images are stored in Vercel Blob instead of the temporary server filesystem.

1. Import the project into Vercel. If the project is inside a `client` folder, set the root directory to `client`.
2. Use Node.js 20 or later. Vercel should detect Vite automatically. Use `npm run build` as the build command and `dist` as the output folder.
3. Create a Blob storage in the Vercel project and connect it. This gives the app the `BLOB_READ_WRITE_TOKEN` value.
4. Add these environment variables in Vercel for production and preview:
   - `MONGODB_URI` - MongoDB Atlas connection string
   - `JWT_SECRET` - Strong secret key
   - `BLOB_READ_WRITE_TOKEN` - Token from the connected Blob store
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` - Email settings for OTP and recovery features
   - Optional: `EMAIL_FROM`
5. In MongoDB Atlas, allow access from Vercel server functions. If needed, allow `0.0.0.0/0` for the database connection. Use a dedicated database user with a strong password.
6. Deploy the project and test the API at `https://<your-domain>/api/health`. A healthy response should show `"status":"ok"` and `"mongo":"connected"`.

The frontend normally uses the same `/api` path. Do not set `VITE_API_URL` to a localhost address in Vercel. If the frontend and API are on different domains, set `VITE_API_URL` to the API URL and configure `CORS_ALLOWED_ORIGINS` with the correct frontend origin.

Vercel has a request size limit. This is lower than the app's local upload limits. Keep uploaded files below the platform limit to avoid errors.

## Installation

1. Clone the project:

   ```bash
   git clone <project-link>
   cd TugonPH
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Make the backend environment file from the example and update the MongoDB values:

   ```bash
   cp server/.env.example server/.env
   ```

   Keep `TugonPH` as the database name in the MongoDB URI. Do not share or commit the `.env` file.

4. Set the frontend API URL in `.env.local`:

   ```env
   VITE_API_URL=/api
   VITE_APP_MODE=development
   ```

## Database setup

The backend uses MongoDB Atlas from `server/.env`. There is no local database fallback in this setup.

In Atlas, allow your machine's public IP in Network Access and create a database user in Database Access.

If you see `querySrv ECONNREFUSED`, add `MONGODB_DNS_SERVERS` in `server/.env` with a trusted DNS server IP.

### Request update polling

The app checks for change in complaints and assistance requests every 7 seconds using the current user token. Residents only receive updates for their own requests. Admins receive updates for all requests.

The polling response includes request IDs, user IDs, and timestamps. When a change is found, the app loads the latest request data from the API. MongoDB and the REST API stay as the source of truth. See [the integration mapping and test plan](./docs/integration-testing.md) for more details.

## Run the application

### Development

Start the API in one terminal:

```bash
npm run server
```

Then start the frontend in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173` in the browser. The frontend sends requests to the Vite dev proxy at `http://127.0.0.1:5000`, so it stays on the same browser origin. The API stores data in Atlas.

### Production build

```bash
npm run build
```

## Available scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the Vite development server on port 5173 |
| `npm run build` | Build the app for production |
| `npm run vercel-build` | Install clean dependencies and build for Vercel |

## Project structure

```text
TugonPH/
|-- docs/
|   |-- address-verification-setup.md
|   `-- integration-testing.md
|-- public/                          # Public files
|-- src/
|   |-- components/
|   |   |-- auth/                    # Login, profile, and user features
|   |   |-- ui/                      # Shared UI components
|   |   |-- admin-panel.tsx          # Admin request management
|   |   |-- assistance-form.tsx      # Assistance request form
|   |   |-- assistance-manager.tsx   # Assistance request update flow
|   |   |-- complaint-form.tsx       # Complaint form
|   |   |-- complaint-manager.tsx    # Complaint update flow
|   |   |-- data-analytics.tsx       # Reports and charts
|   |   |-- heatmap-dashboard.tsx    # Map view for reports
|   |   |-- heatmap-panel.tsx        # Heatmap display
|   |   |-- map-picker.tsx           # Location selection
|   |   `-- unified-dashboard.tsx    # Resident dashboard
|   |-- config/
|   |   `-- categories.ts            # Request categories
|   |-- services/
|   |   `-- api.ts                   # API calls
|   |-- styles/
|   |   `-- globals.css
|   |-- App.tsx
|   `-- main.tsx
|-- server/
|   |-- controllers/
|   |-- middleware/
|   |-- models/
|   |-- routes/
|   `-- server.js
|-- package.json
|-- vite.config.ts
`-- README.md
```

## User roles

### Guest

- Submit anonymous complaints.
- Submit anonymous assistance requests.
- Cannot track request status after leaving guest mode.

### Resident

- Register and verify email with OTP.
- Wait for admin approval.
- Submit and view own complaints.
- Submit and view own assistance requests.
- Track status and admin responses.
- Receive updates about relevant request activity.
- Update profile and settings.

### Admin

- View all complaints and assistance requests.
- Update status, priority, and notes.
- Delete valid records when needed.
- Review and approve pending registrations.
- View analytics and heatmap dashboards.
- Manage users and permissions.

## Troubleshooting

### Assistance requests do not submit

- Check if the backend is running and MongoDB is connected.
- Make sure the request includes a title, category, description, address, proof, and valid 11-digit contact number.
- Look at the API response for validation or permission errors.

### Requests do not update after polling

- Confirm the backend is running.
- Restart the client after logout or token expiry.
- Check the browser console for errors.

### Permission denied errors

- Check if the user is logged in with the right role.
- Make sure a resident only sees their own requests.
- Make sure the admin account is authenticated before admin actions.

### Build errors

- Delete `node_modules` and `package-lock.json`.
- Run `npm install` again.
- Confirm that Node.js version is 20 or higher.

## Customization

- Global styles: `src/styles/globals.css`
- Shared categories: `src/config/categories.ts`

## Roadmap

- [x] In-app notification center with unread badge
- [x] Complaint and assistance heatmap dashboard
- [x] Assistance request submission and admin management
- [x] Guest complaint and assistance submission
- [x] Email OTP registration flow with pending approval
- [x] Analytics export for web

## License

This project is private and proprietary.

---

Current branch: Active development
