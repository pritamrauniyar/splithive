SplitHive — Open Splitwise-style App

Free, cross-platform expense splitting app for friends and family.

Stack
- Mobile: React Native (Expo)
- Backend: Node.js + Express
- Database: MySQL

Local Setup
1) Backend
- Copy `backend/.env.example` to `backend/.env` and set DB creds.
- Create database `splithive` and run `backend/db/schema.sql` in MySQL.
- From `backend/`: `npm install` (requires internet), then `npm run start`.
- Health check: GET `http://localhost:4000/health`.

2) Mobile (Expo)
- From `app/`: `npm install` (requires internet).
- Update API base URL in `app/src/lib/api.ts` if needed.
- Run with Expo: `npm start`.

Deploying to cPanel (high-level)
- MySQL: Create DB and run `backend/db/schema.sql`.
- Node app: Use cPanel Application Manager or Passenger to run `backend/src/server.js`.
- Configure env vars: `PORT`, `DB_*` in cPanel.
- Reverse proxy your public domain/subdomain to the Node app port.

Key API Endpoints
- POST `/users` — create user
- POST `/groups` — create group
- POST `/groups/:groupId/members` — add member to group
- POST `/expenses` — create expense (equal split)
- GET `/groups/:groupId/expenses` — list group expenses
- GET `/groups/:groupId/balances` — per-user net balances
- POST `/expenses/group/:groupId/settlements` — record settlement payment

Notes
- Balances: positive = user should receive; negative = user owes.
- Splits currently equal among provided participants; custom splits can be added later.

