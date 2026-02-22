import { useState, useEffect } from "react";
import cronstrue from "cronstrue";
import { apiFetch } from "../lib/api";
import { formatDateTime, formatNextRun } from "../lib/date";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [nextRuns, setNextRuns] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [filterDb, setFilterDb] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { res, data } = await apiFetch("/api/logs");
        if (res.ok) {
          setLogs(data.logs || []);
          setNextRuns(data.nextRuns || []);
          setSchedule(data.schedule || null);
        }
      } catch (_) {}
    }
    fetchLogs();
    const id = setInterval(fetchLogs, 2000);
    return () => clearInterval(id);
  }, []);

  let scheduleEnglish = "";
  if (schedule?.cronExpression) {
    try {
      scheduleEnglish = cronstrue.toString(schedule.cronExpression);
    } catch {
      scheduleEnglish = schedule.cronExpression;
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (filterDb && (log.dbName || "").toLowerCase().indexOf(filterDb.trim().toLowerCase()) === -1) return false;
    if (filterTable && (log.tableName || "").toLowerCase().indexOf(filterTable.trim().toLowerCase()) === -1) return false;
    if (filterStatus && (log.status || "") !== filterStatus) return false;
    return true;
  });

  return (
    <div className="page-logs">
      <h2 className="logs-title">Sync logs</h2>
      <p className="logs-desc">History of sync runs from the Sync button or from the backend schedule. Data is stored on the server and persists across sessions.</p>

      {(schedule || nextRuns.length > 0) && (
        <div className="logs-schedule-card">
          {scheduleEnglish && (
            <div className="logs-schedule-row">
              <span className="logs-schedule-label">Schedule</span>
              <span className="logs-schedule-english">{scheduleEnglish}</span>
            </div>
          )}
          {nextRuns.length > 0 && (
            <div className="logs-next-runs">
              <span className="logs-next-label">Next runs</span>
              <ul className="logs-next-list">
                {nextRuns.map((iso, i) => (
                  <li key={i} className="logs-next-item">
                    <span className="logs-next-time">{formatNextRun(iso)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!schedule && nextRuns.length === 0 && (
        <p className="logs-no-schedule">No schedule set. Save a CRON and table selection on the Home page to run sync automatically.</p>
      )}

      <div className="logs-table-section">
        <h3 className="logs-table-title">Recent syncs</h3>
        <div className="logs-filters">
          <label className="logs-filter-group">
            <span className="logs-filter-label">Database</span>
            <input
              type="text"
              className="logs-filter-input"
              placeholder="Filter by database"
              value={filterDb}
              onChange={(e) => setFilterDb(e.target.value)}
            />
          </label>
          <label className="logs-filter-group">
            <span className="logs-filter-label">Table</span>
            <input
              type="text"
              className="logs-filter-input"
              placeholder="Filter by table"
              value={filterTable}
              onChange={(e) => setFilterTable(e.target.value)}
            />
          </label>
          <label className="logs-filter-group">
            <span className="logs-filter-label">Status</span>
            <select
              className="logs-filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
          </label>
        </div>
        <div className="logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Database</th>
                <th>Table</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="logs-empty">
                    {logs.length === 0 ? "No logs yet. Run Sync or save a CRON schedule." : "No logs match the filters."}
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => (
                <tr key={log.id} className={"logs-row logs-row--" + log.status}>
                  <td className="logs-cell logs-time">{formatDateTime(log.timestamp)}</td>
                  <td className="logs-cell">{log.dbName}</td>
                  <td className="logs-cell">{log.tableName}</td>
                  <td className="logs-cell">
                    <span className={"logs-badge logs-badge--" + log.status}>{log.status}</span>
                  </td>
                  <td className="logs-cell logs-details">
                    {log.status === "error" && log.message ? log.message : (log.synced != null ? log.synced : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
