require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const path = require("path");
const backendPort = process.env.PORT || 3080;
const frontendPort = process.env.FRONTEND_PORT || 3000;

// Absolute path so frontend works when PM2 is started from Task Scheduler (different cwd)
const frontendDistPath = path.join(__dirname, "frontend", "dist");

// Frontend: run serve via node (use process.execPath so no reliance on PATH in scheduled tasks)
let frontendScript = process.execPath;
let frontendArgs = ["-s", frontendDistPath, "-l", String(frontendPort)];
try {
  const serveScript = require.resolve("serve/build/main.js");
  frontendArgs = [serveScript, "-s", frontendDistPath, "-l", String(frontendPort)];
} catch (_) {
  frontendScript = "npx";
  frontendArgs = ["serve", "-s", frontendDistPath, "-l", String(frontendPort)];
}

module.exports = {
  apps: [
    {
      name: "gofrugaldbsynker-backend",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: { PORT: String(backendPort) },
    },
    {
      name: "gofrugaldbsynker-frontend",
      script: frontendScript,
      args: frontendArgs,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
