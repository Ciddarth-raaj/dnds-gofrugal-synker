import { useState, useEffect } from "react";
import cronstrue from "cronstrue";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { getSchedule, saveSchedule } from "../lib/logs";
import FilterDialog from "../components/FilterDialog";

function tableKey(dbName, tableName) {
  return `${dbName}\0${tableName}`;
}

function filterStorageKey(dbName, tableName) {
  return `${dbName}_${tableName}`;
}

export default function Home() {
  const [databases, setDatabases] = useState([]);
  const [tablesByDb, setTablesByDb] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [cronExpression, setCronExpression] = useState("");
  const [cronPreview, setCronPreview] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState({ type: null, text: null });

  const [nextRuns, setNextRuns] = useState([]);
  const [expandedDbs, setExpandedDbs] = useState(new Set());
  const [allFilters, setAllFilters] = useState({});
  const [filterDialog, setFilterDialog] = useState(null);
  const [syncingTableKey, setSyncingTableKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const dbResult = await apiFetch("/api/databases");
        const { res: dbRes, data: dbData } = dbResult;
        if (cancelled) return;
        if (dbRes.ok && dbData.databases) {
          const dbs = dbData.databases;
          setDatabases(dbs);
          if (dbs.length > 0) setExpandedDbs((prev) => (prev.size ? prev : new Set([dbs[0]])));
          const byDb = {};
          for (const db of dbs) {
            const { data: td } = await apiFetch(`/api/databases/${encodeURIComponent(db)}/tables`);
            if (!cancelled) byDb[db] = td.tables || [];
          }
          if (!cancelled) setTablesByDb(byDb);
        }
        const scheduleRes = await apiFetch("/api/schedule");
        if (cancelled) return;
        if (scheduleRes.res.ok && scheduleRes.data.nextRuns) {
          setNextRuns(scheduleRes.data.nextRuns);
        }
        const fromApi = scheduleRes.res.ok ? scheduleRes.data.schedule : null;
        const saved = fromApi || getSchedule();
        if (saved?.cronExpression) setCronExpression(saved.cronExpression);
        else setCronExpression("");
        if (saved?.selectedTables?.length) {
          setSelected(new Set(saved.selectedTables.map((t) => tableKey(t.dbName, t.tableName))));
        } else {
          setSelected(new Set());
        }
        if (fromApi) saveSchedule(fromApi);
        const filtersRes = await apiFetch("/api/filters");
        if (!cancelled && filtersRes.res.ok && filtersRes.data.filters) {
          setAllFilters(filtersRes.data.filters);
        }
      } catch (e) {
        if (!cancelled) setMessage({ type: "error", text: e.message || "Failed to load" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cronExpression.trim()) {
      setCronPreview("");
      return;
    }
    try {
      setCronPreview(cronstrue.toString(cronExpression.trim()));
    } catch {
      setCronPreview("Invalid expression");
    }
  }, [cronExpression]);

  async function runSyncForTables(tables) {
    for (const { dbName, tableName } of tables) {
      try {
        const { res, data } = await apiFetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbName, tableName }),
        });
        if (!res.ok) {
          setMessage({ type: "error", text: data.error || "Sync failed" });
        }
      } catch (e) {
        setMessage({ type: "error", text: e.message });
      }
    }
  }

  function toggleDb(dbName) {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(dbName)) next.delete(dbName);
      else next.add(dbName);
      return next;
    });
  }

  async function handleSaveFilters(dbName, tableName, filters) {
    try {
      const { res } = await apiFetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName, tableName, filters }),
      });
      if (res.ok) {
        const key = filterStorageKey(dbName, tableName);
        setAllFilters((prev) => ({ ...prev, [key]: filters }));
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Failed to save filters" });
    }
  }

  async function handleSyncTable(dbName, tableName) {
    const key = tableKey(dbName, tableName);
    setSyncingTableKey(key);
    setMessage({ type: null, text: null });
    try {
      const { res, data } = await apiFetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName, tableName }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: data.message || `Synced ${tableName}. See Logs.` });
      } else {
        setMessage({ type: "error", text: data.error || "Sync failed" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Sync failed" });
    } finally {
      setSyncingTableKey(null);
    }
  }

  function toggleTable(dbName, tableName) {
    const key = tableKey(dbName, tableName);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setMessage({ type: null, text: null });
    const tables = [];
    selected.forEach((key) => {
      const [dbName, tableName] = key.split("\0");
      tables.push({ dbName, tableName });
    });
    if (!cronExpression.trim()) {
      setMessage({ type: "error", text: "Enter a CRON expression" });
      return;
    }
    if (tables.length === 0) {
      setMessage({ type: "error", text: "Select at least one table" });
      return;
    }
    try {
      const { res, data } = await apiFetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronExpression: cronExpression.trim(), selectedTables: tables }),
      });
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Save failed" });
        return;
      }
      saveSchedule({ cronExpression: cronExpression.trim(), selectedTables: tables });
      setNextRuns(data.nextRuns || []);
      setMessage({ type: "success", text: "Schedule saved. Backend will run sync at CRON times (even when this page is closed)." });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Save failed" });
    }
  }

  function handleReset() {
    setMessage({ type: null, text: null });
    const saved = getSchedule();
    if (saved?.cronExpression) setCronExpression(saved.cronExpression);
    else setCronExpression("");
    if (saved?.selectedTables?.length) {
      setSelected(new Set(saved.selectedTables.map((t) => tableKey(t.dbName, t.tableName))));
    } else {
      setSelected(new Set());
    }
    setMessage({ type: "success", text: "Reset to last saved state." });
  }

  async function handleSync() {
    const tables = [];
    selected.forEach((key) => {
      const [dbName, tableName] = key.split("\0");
      tables.push({ dbName, tableName });
    });
    if (tables.length === 0) {
      setMessage({ type: "error", text: "Select at least one table" });
      return;
    }
    setSyncing(true);
    setMessage({ type: null, text: null });
    await runSyncForTables(tables);
    setMessage({ type: "success", text: `Sync completed for ${tables.length} table(s). See Logs.` });
    setSyncing(false);
  }

  if (loading) {
    return (
      <div className="page-home">
        <p className="loading">Loading databases and tables…</p>
      </div>
    );
  }

  return (
    <div className="page-home">
      <div className="toolbar">
        <div className="toolbar-row">
          <label className="cron-label">CRON expression</label>
          <input
            type="text"
            className="cron-input"
            placeholder="e.g. */5 * * * *"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            disabled={syncing}
          />
          {(cronPreview || nextRuns.length > 0) && (
            <div className="cron-english-card">
              {cronPreview && (
                <div className="cron-english-row">
                  <span className="cron-english-label">Schedule in plain English</span>
                  <span className={"cron-english-text " + (cronPreview === "Invalid expression" ? "cron-english-text--error" : "")}>
                    {cronPreview}
                  </span>
                </div>
              )}
              {nextRuns.length > 0 && (
                <div className="cron-next-runs">
                  <span className="cron-next-label">Next runs</span>
                  <ul className="cron-next-list">
                    {nextRuns.map((iso, i) => (
                      <li key={i} className="cron-next-item">{formatDateTime(iso)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="toolbar-buttons">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={syncing}>
            Save
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={syncing}>
            Reset
          </button>
          <button type="button" className="btn btn-sync" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {message.text && (
        <p className={"message message-" + (message.type === "error" ? "error" : "success")}>
          {message.text}
        </p>
      )}

      <div className="tree-section">
        <h2 className="tree-title">Databases & tables</h2>
        <p className="tree-hint">Select tables to sync. Save stores the schedule on the backend so sync runs at CRON times even when this page is closed. Sync runs immediately for selected tables.</p>
        <ul className="tree-list">
          {databases.map((dbName) => {
            const expanded = expandedDbs.has(dbName);
            const tables = tablesByDb[dbName] || [];
            return (
              <li key={dbName} className="tree-db">
                <button
                  type="button"
                  className="tree-db-header"
                  onClick={() => toggleDb(dbName)}
                  aria-expanded={expanded}
                >
                  <span className="tree-db-chevron" aria-hidden>{expanded ? "▼" : "▶"}</span>
                  <span className="tree-db-name">{dbName}</span>
                  <span className="tree-db-count">{tables.length} table{tables.length !== 1 ? "s" : ""}</span>
                </button>
                {expanded && (
                  <ul className="tree-tables">
                    {tables.map((tableName) => {
                      const key = tableKey(dbName, tableName);
                      const checked = selected.has(key);
                      const filterKeyStr = filterStorageKey(dbName, tableName);
                      const tableFilters = allFilters[filterKeyStr] || [];
                      const hasFilters = tableFilters.length > 0;
                      const tableSyncing = syncingTableKey === key;
                      return (
                        <li key={key} className="tree-table">
                          <label className="tree-table-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTable(dbName, tableName)}
                              disabled={syncing}
                            />
                            <span className="tree-table-name">{tableName}</span>
                          </label>
                          <div className="tree-table-actions">
                            <button
                              type="button"
                              className="tree-table-sync-btn"
                              onClick={() => handleSyncTable(dbName, tableName)}
                              disabled={syncing || tableSyncing}
                              title="Sync this table now"
                            >
                              {tableSyncing ? "Syncing…" : "Sync"}
                            </button>
                            <button
                              type="button"
                              className="tree-table-filter-btn"
                              onClick={() => setFilterDialog({ dbName, tableName })}
                              disabled={syncing}
                              title={hasFilters ? `${tableFilters.length} filter(s)` : "Add filters"}
                            >
                              {hasFilters ? `Filter (${tableFilters.length})` : "Filter"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {filterDialog && (
          <FilterDialog
            dbName={filterDialog.dbName}
            tableName={filterDialog.tableName}
            initialFilters={allFilters[filterStorageKey(filterDialog.dbName, filterDialog.tableName)] || []}
            onClose={() => setFilterDialog(null)}
            onSave={(filters) => handleSaveFilters(filterDialog.dbName, filterDialog.tableName, filters)}
          />
        )}
        {databases.length === 0 && (
          <p className="tree-empty">No databases found. Check connection or use IS_DEV with dev-tables.json.</p>
        )}
      </div>
    </div>
  );
}
