require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const backendPort = process.env.PORT || 3080;
const frontendPort = process.env.FRONTEND_PORT || 3000;

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
      script: require("path").join(__dirname, "node_modules", ".bin", "serve"),
      args: ["-s", "frontend/dist", "-l", String(frontendPort)],
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
