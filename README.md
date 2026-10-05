# TugonPH

A barangay service management system built with React, TypeScript, Vite, Express, MongoDB, JWT authentication, Socket.IO, and local filesystem storage. TugonPH helps residents and guests submit complaints or assistance requests, while administrators manage submissions, verify accounts, review analytics, and monitor request locations in real time.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-TugonPH-47A248.svg)

## Features

### For Residents

- **Complaint Submission** - Report barangay concerns with required photo evidence, contact validation, and optional pinned map location.
- **Assistance Submission** - Request barangay support for health services, emergencies, financial aid, medical assistance, senior citizen support, PWD assistance, food assistance, disaster relief, burial assistance, and scholarship or educational assistance.
- **Unified Dashboard** - View complaints and assistance requests together with searchable, filterable request lists and combined status totals.
- **Status Tracking** - Track pending, in-progress, resolved, and rejected requests with admin notes.
- **Web Notifications** - Receive complaint and assistance activity updates with unread/read tracking.
- **Profile and Settings** - Manage profile details, notifications, theme, and resident settings.

### For Guests

- **Anonymous Submission Mode** - Continue as guest and submit either a complaint or assistance request without creating an account.
- **Guest Request Labels** - Anonymous submissions are recorded with generated names such as `Anonymous001`.
- **Photo and Contact Requirements** - Guest submissions follow the same evidence and 11-digit contact number validation as resident submissions.

### For Administrators

- **Complaint and Assistance Management** - Review, filter, prioritize, update status, add admin notes, and delete eligible records.
- **Account Approval Workflow** - Approve or reject pending accounts after email verification.
- **Combined Heatmap Dashboard** - View geotagged complaints and assistance requests together, with category filtering.
- **Data Analytics** - Analyze complaint and assistance volume, status breakdowns, categories, trends, insights, and CSV exports.
- **User Management** - Manage resident accounts, permissions, and account verification state.

### General Features

- **Role-Based Access Control** - Separate resident, guest, and admin capabilities.
- **Pending Approval Enforcement** - New verified registrations remain pending until admin approval.
- **Strict Contact Validation** - Contact numbers are normalized and validated as 11-digit numeric values.
- **Real-Time Sync** - Authenticated residents receive changes for their own complaints and assistance requests; admins receive all request changes through Socket.IO. REST and MongoDB remain the source of truth.
- **Responsive Interface** - Optimized for desktop and mobile layouts.

## Tech Stack

### Frontend

- **React 18.3.1** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite 6** - Build tool and development server
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **Recharts** - Analytics charts
- **Leaflet and leaflet.heat** - Mapping and heatmap visualization
- **React Hook Form** - Form validation and management
- **Sonner** - Toast notifications

### Backend and Database

- **Express and Mongoose** - REST API and MongoDB Atlas database (`TugonPH`)
- **Socket.IO** - Authenticated realtime request-change events on the Express HTTP server
- **Local Filesystem Storage** - Profile pictures and resolution proofs are stored locally on the server

## Prerequisites

- **Node.js** v16 or higher
- **npm**, **yarn**, or **pnpm**
- A MongoDB Atlas cluster, database user, and network access entry for your current IP

## Installation

1. Clone the repository:

   ```bash
   git clone link TugonPH
   cd TugonPH
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the backend environment file from the example, then replace the MongoDB URI placeholders with the Atlas connection string and database user credentials:

   ```bash
   cp server/.env.example server/.env
   ```

   Keep `TugonPH` as the database name in the URI. Do not commit or share `server/.env`.

4. Configure the frontend API URL in `.env.local`:

   ```env
   VITE_API_URL=/api
   VITE_APP_MODE=development
   ```

## Database Setup

The backend connects only to MongoDB Atlas using `MONGODB_URI` from `server/.env`; there is no local database fallback. In Atlas, allow the machine's public IP under Network Access and create a database user under Database Access.
If Node.js reports `querySrv ECONNREFUSED` while resolving the Atlas hostname, set `MONGODB_DNS_SERVERS` in `server/.env` to a trusted DNS resolver IP. The example file shows the optional setting.

### Realtime

Socket.IO runs on the Express API port (`5000`). Authenticated clients connect with their existing JWT. Residents join only their own user room; admins join the admin room. Request changes are emitted only after the corresponding MongoDB write completes.

## Running the Application

### Development

Start the Express API in one terminal:

```bash
npm run server
```

Then start the Vite frontend in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173`. The frontend sends API and Socket.IO requests
through the Vite development proxy to `http://127.0.0.1:5000`, so the browser
uses the same `localhost:5173` origin for authentication. The API stores its
database data in Atlas.

### Production Build

```bash
npm run build
```

## Available Scripts

| Command                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Start the Vite development server on port 5173  |
| `npm run build`         | Build the app for production                    |
| `npm run vercel-build`  | Install clean dependencies and build for Vercel |

## Project Structure

```text
TugonPH/
|-- docs/
|   `-- address-verification-setup.md
|-- public/                          # Static public assets
|-- src/
|   |-- components/
|   |   |-- auth/                    # Auth, profile, and user management
|   |   |-- ui/                      # Reusable Radix/shadcn-style UI components
|   |   |-- admin-panel.tsx          # Admin complaint and assistance management
|   |   |-- assistance-form.tsx      # Assistance request submission
|   |   |-- assistance-manager.tsx   # Assistance request state and realtime sync
|   |   |-- complaint-form.tsx       # Complaint submission
|   |   |-- complaint-manager.tsx    # Complaint state and realtime sync
|   |   |-- data-analytics.tsx       # Complaint and assistance analytics
|   |   |-- heatmap-dashboard.tsx    # Combined heatmap page
|   |   |-- heatmap-panel.tsx        # Leaflet heatmap rendering
|   |   |-- map-picker.tsx           # Location picker
|   |   `-- unified-dashboard.tsx    # Resident dashboard
|   |-- config/
|   |   `-- categories.ts            # Complaint and assistance categories
|   |-- services/
|   |   `-- api.ts                   # Express API integration
|   |-- styles/
|   |   `-- globals.css
|   |-- App.tsx
|   `-- main.tsx
|-- server/
|   |-- controllers/
|   |-- middleware/
|   |-- models/
|   |-- routes/
|   |-- realtime/
|   `-- server.js
|-- package.json
|-- vite.config.ts
`-- README.md
```

## User Roles

### Guest

- Submit anonymous complaints.
- Submit anonymous assistance requests.
- Cannot track request status after leaving guest mode.

### Resident

- Register, verify email with an OTP, and await admin approval.
- Submit and view own complaints.
- Submit and view own assistance requests.
- Track request status and admin responses.
- Receive realtime updates for relevant request activity.
- Update profile and settings.

### Admin

- View all complaints and assistance requests.
- Update status, priority, and admin notes.
- Delete eligible complaint and assistance records.
- Review and verify pending registrations.
- Access combined analytics and heatmap dashboards.
- Manage users and account permissions.

## Troubleshooting

### Assistance requests do not submit

- Confirm the backend is running and MongoDB is connected.
- Verify the request payload includes a title, category, description, address, required photo/document, and valid 11-digit contact number.
- Check the API response for validation or permission errors.

### Requests do not update in real time

- Confirm the backend Socket.IO server is running on the same Express API port.
- Restart the client after a token expiry or logout/login cycle.
- Check the browser console for auth or socket errors.

### Permission denied errors

- Confirm the user is authenticated and has the correct role.
- Ensure a resident only accesses their own records.
- Ensure admin actions are performed with an authenticated admin account.

### Build errors

- Delete `node_modules` and `package-lock.json`.
- Run `npm install`.
- Confirm Node.js is v16 or higher.

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

Current Branch: Active Development
