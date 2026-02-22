const LOGS_KEY = "gofrugal_sync_logs";
const SCHEDULE_KEY = "gofrugal_schedule";
const MAX_LOGS = 500;

export function getLogs() {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addLog(entry) {
  const logs = getLogs();
  logs.unshift({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

export function getSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSchedule(schedule) {
  if (schedule) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  } else {
    localStorage.removeItem(SCHEDULE_KEY);
  }
}
