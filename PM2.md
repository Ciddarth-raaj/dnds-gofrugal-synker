# Running backend and frontend with PM2

Run the backend and frontend **separately** under PM2 (built frontend is served; backend runs as Node).

## 1. Env

- **Root `.env`**: set `PORT` (backend, default 3080) and optionally `FRONTEND_PORT` (default 3000).
- **Frontend when built for separate BE**: in `frontend/.env` set `VITE_API_URL` to your backend URL (e.g. `http://localhost:3080`) **before** building, so the built app talks to the right API.

## 2. Build frontend

From repo root:

```bash
npm run build --prefix frontend
```

## 3. Install dependencies (including `serve`)

```bash
npm install
```

## 4. Start both with PM2

```bash
pm2 start ecosystem.config.cjs
```

- Backend: `http://localhost:<PORT>` (default 3080)
- Frontend: `http://localhost:<FRONTEND_PORT>` (default 3000)

## 5. Useful PM2 commands

- List: `pm2 list`
- Logs: `pm2 logs` (both) or `pm2 logs gofrugaldbsynker-backend` / `pm2 logs gofrugaldbsynker-frontend`
- Stop all: `pm2 stop ecosystem.config.cjs`
- Stop one: `pm2 stop gofrugaldbsynker-backend` or `pm2 stop gofrugaldbsynker-frontend`
- Restart: `pm2 restart ecosystem.config.cjs` or restart by app name

After changing frontend, rebuild then restart the frontend app:

```bash
npm run build --prefix frontend && pm2 restart gofrugaldbsynker-frontend
```

## 6. Troubleshooting (Windows)

**Error: connect EPERM //./pipe/rpc.sock** — PM2’s daemon socket is stuck or blocked.

**Without Administrator:**

1. Close every terminal/IDE window that has ever run `pm2` (so nothing is using the socket).
2. Open **Task Manager** (Ctrl+Shift+Esc) → **Details** tab → end any **Node.js** or **PM2** processes.
3. Open a **new** normal PowerShell (no need for Admin). Try:
   ```powershell
   pm2 kill
   pm2 start ecosystem.config.cjs
   ```
4. If that still gives EPERM, reset PM2’s folder (it’s in your user profile, so Admin is not required):
   ```powershell
   Remove-Item -Recurse -Force $env:USERPROFILE\.pm2 -ErrorAction SilentlyContinue
   pm2 start ecosystem.config.cjs
   ```
5. If a file is “in use” and won’t delete, restart the PC (no Admin needed for restart on most setups), then run step 4 and `pm2 start ecosystem.config.cjs` again.
