require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const backendPort = process.env.PORT || 3080;
const frontendPort = process.env.FRONTEND_PORT || 3000;

// Frontend: run serve via node (Windows-friendly) or npx if serve not resolved
let frontendScript = "node";
let frontendArgs = ["-s", "frontend/dist", "-l", String(frontendPort)];
try {
  const serveScript = require.resolve("serve/build/main.js");
  frontendArgs = [serveScript, "-s", "frontend/dist", "-l", String(frontendPort)];
} catch (_) {
  frontendScript = "npx";
  frontendArgs = ["serve", "-s", "frontend/dist", "-l", String(frontendPort)];
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
