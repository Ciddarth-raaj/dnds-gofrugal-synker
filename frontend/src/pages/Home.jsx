import { useState, useEffect } from "react";
import cronstrue from "cronstrue";
import toast from "react-hot-toast";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { getSchedule, saveSchedule } from "../lib/logs";
import FilterDialog from "../components/FilterDialog";
import TablePreviewModal from "../components/TablePreviewModal";

function tableKey(dbName, tableName) {
  return `${dbName}\0${tableName}`;
}

/** Wrap matching substrings in <mark> (case-insensitive). Returns array of strings and elements. */
function highlightMatch(text, search) {
  if (!search || !String(text)) return [String(text)];
  const str = String(text);
  const q = String(search).trim();
  if (!q) return [str];
  const lower = str.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts = [];
  let last = 0;
  let i = lower.indexOf(lowerQ);
  while (i !== -1) {
    if (i > last) parts.push(str.slice(last, i));
    parts.push(<mark key={parts.length} className="search-highlight">{str.slice(i, i + q.length)}</mark>);
    last = i + q.length;
    i = lower.indexOf(lowerQ, last);
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts.length ? parts : [str];
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

  const [nextRuns, setNextRuns] = useState([]);
  const [expandedDbs, setExpandedDbs] = useState(new Set());
  const [allFilters, setAllFilters] = useState({});
  const [filterDialog, setFilterDialog] = useState(null);
  const [syncingTableKey, setSyncingTableKey] = useState(null);
  const [schedulePaused, setSchedulePaused] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [previewModal, setPreviewModal] = useState(null);

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
          if (dbs.length > 0)
            setExpandedDbs((prev) => (prev.size ? prev : new Set([dbs[0]])));
          const byDb = {};
          for (const db of dbs) {
            const { data: td } = await apiFetch(
              `/api/databases/${encodeURIComponent(db)}/tables`
            );
            if (!cancelled) byDb[db] = td.tables || [];
          }
          if (!cancelled) setTablesByDb(byDb);
        }
        const scheduleRes = await apiFetch("/api/schedule");
        if (cancelled) return;
        if (scheduleRes.res.ok) {
          if (scheduleRes.data.nextRuns) setNextRuns(scheduleRes.data.nextRuns);
          setSchedulePaused(Boolean(scheduleRes.data.paused));
        }
        const fromApi = scheduleRes.res.ok ? scheduleRes.data.schedule : null;
        const saved = fromApi || getSchedule();
        if (saved?.cronExpression) setCronExpression(saved.cronExpression);
        else setCronExpression("");
        if (saved?.selectedTables?.length) {
          setSelected(
            new Set(
              saved.selectedTables.map((t) => tableKey(t.dbName, t.tableName))
            )
          );
        } else {
          setSelected(new Set());
        }
        if (fromApi) saveSchedule(fromApi);
        const filtersRes = await apiFetch("/api/filters");
        if (!cancelled && filtersRes.res.ok && filtersRes.data.filters) {
          setAllFilters(filtersRes.data.filters);
        }
      } catch (e) {
        if (!cancelled) toast.error(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
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
        if (!res.ok) toast.error(data.error || "Sync failed");
      } catch (e) {
        toast.error(e.message);
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
        toast.success("Filters saved");
      }
    } catch (e) {
      toast.error(e.message || "Failed to save filters");
    }
  }

  async function handleSyncTable(dbName, tableName) {
    const key = tableKey(dbName, tableName);
    setSyncingTableKey(key);
    try {
      const { res, data } = await apiFetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName, tableName }),
      });
      if (res.ok) {
        toast.success(data.message || `Synced ${tableName}. See Logs.`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (e) {
      toast.error(e.message || "Sync failed");
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
    const tables = [];
    selected.forEach((key) => {
      const [dbName, tableName] = key.split("\0");
      tables.push({ dbName, tableName });
    });
    if (!cronExpression.trim()) {
      toast.error("Enter a CRON expression");
      return;
    }
    if (tables.length === 0) {
      toast.error("Select at least one table");
      return;
    }
    try {
      const { res, data } = await apiFetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cronExpression: cronExpression.trim(),
          selectedTables: tables,
        }),
      });
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      saveSchedule({
        cronExpression: cronExpression.trim(),
        selectedTables: tables,
      });
      setNextRuns(data.nextRuns || []);
      setSchedulePaused(Boolean(data.paused));
      toast.success("Schedule saved. Backend will run sync at CRON times (even when this page is closed).");
    } catch (e) {
      toast.error(e.message || "Save failed");
    }
  }

  function handleReset() {
    const saved = getSchedule();
    if (saved?.cronExpression) setCronExpression(saved.cronExpression);
    else setCronExpression("");
    if (saved?.selectedTables?.length) {
      setSelected(
        new Set(
          saved.selectedTables.map((t) => tableKey(t.dbName, t.tableName))
        )
      );
    } else {
      setSelected(new Set());
    }
    toast.success("Reset to last saved state.");
  }

  async function handleSync() {
    const tables = [];
    selected.forEach((key) => {
      const [dbName, tableName] = key.split("\0");
      tables.push({ dbName, tableName });
    });
    if (tables.length === 0) {
      toast.error("Select at least one table");
      return;
    }
    setSyncing(true);
    await runSyncForTables(tables);
    toast.success(`Sync completed for ${tables.length} table(s). See Logs.`);
    setSyncing(false);
  }

  async function handlePauseResume(paused) {
    try {
      const { res, data } = await apiFetch("/api/schedule/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!res.ok) {
        toast.error(data.error || "Failed to update pause state");
        return;
      }
      setSchedulePaused(Boolean(data.paused));
      toast.success(
        data.paused
          ? "Scheduled sync stopped. Click Resume to run again at CRON times."
          : "Scheduled sync resumed."
      );
    } catch (e) {
      toast.error(e.message || "Failed");
    }
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
          {(cronPreview || nextRuns.length > 0) && !schedulePaused && (
            <div className="cron-english-card">
              {cronPreview && (
                <div className="cron-english-row">
                  <span className="cron-english-label">
                    Schedule in plain English
                  </span>
                  <span
                    className={
                      "cron-english-text " +
                      (cronPreview === "Invalid expression"
                        ? "cron-english-text--error"
                        : "")
                    }
                  >
                    {cronPreview}
                  </span>
                </div>
              )}
              {nextRuns.length > 0 && (
                <div className="cron-next-runs">
                  <span className="cron-next-label">Next runs</span>
                  <ul className="cron-next-list">
                    {nextRuns.map((iso, i) => (
                      <li key={i} className="cron-next-item">
                        {formatDateTime(iso)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {nextRuns.length > 0 && schedulePaused && (
          <p className="schedule-paused-msg">
            Scheduled sync is paused. Click Resume to run again at CRON times.
          </p>
        )}
        <div className="toolbar-buttons">
          <div className="toolbar-buttons-left">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={syncing}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={syncing}
            >
              Reset
            </button>
          </div>
          <div className="toolbar-buttons-right">
            {nextRuns.length > 0 &&
              (schedulePaused ? (
                <button
                  type="button"
                  className="btn btn-resume"
                  onClick={() => handlePauseResume(false)}
                  disabled={syncing}
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-stop"
                  onClick={() => handlePauseResume(true)}
                  disabled={syncing}
                >
                  Stop sync
                </button>
              ))}
            <button
              type="button"
              className="btn btn-sync"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>
      </div>

      <div className="tree-section">
        <h2 className="tree-title">Databases & tables</h2>
        <p className="tree-hint">
          Select tables to sync. Save stores the schedule on the backend so sync
          runs at CRON times even when this page is closed. Sync runs
          immediately for selected tables.
        </p>
        <div className="tree-search-wrap">
          <input
            type="search"
            className="tree-search-input"
            placeholder="Search databases and tables…"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            aria-label="Search tables"
          />
        </div>
        <ul className="tree-list">
          {databases.map((dbName) => {
            const expanded = expandedDbs.has(dbName);
            let tables = tablesByDb[dbName] || [];
            const searchTrim = tableSearch.trim().toLowerCase();
            if (searchTrim) {
              const dbMatch = dbName.toLowerCase().includes(searchTrim);
              tables = tables.filter(
                (t) => dbMatch || t.toLowerCase().includes(searchTrim)
              );
              if (tables.length === 0) return null;
            }
            // Selected tables first, then unselected; keep same order within each group
            tables = [
              ...tables.filter((t) => selected.has(tableKey(dbName, t))),
              ...tables.filter((t) => !selected.has(tableKey(dbName, t))),
            ];
            return (
              <li key={dbName} className="tree-db">
                <button
                  type="button"
                  className="tree-db-header"
                  onClick={() => toggleDb(dbName)}
                  aria-expanded={expanded}
                >
                  <span className="tree-db-chevron" aria-hidden>
                    {expanded ? "▼" : "▶"}
                  </span>
                  <span className="tree-db-name">
                    {searchTrim ? highlightMatch(dbName, tableSearch) : dbName}
                  </span>
                  <span className="tree-db-count">
                    {tables.length} table{tables.length !== 1 ? "s" : ""}
                    {(() => {
                      const n = tables.filter((t) => selected.has(tableKey(dbName, t))).length;
                      return n > 0 ? (
                        <span className="tree-db-selected"> ({n} selected)</span>
                      ) : null;
                    })()}
                  </span>
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
                        <li key={key} className="tree-table-row">
                          <div className="tree-table">
                            <label className="tree-table-label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTable(dbName, tableName)}
                                disabled={syncing}
                              />
                              <span className="tree-table-name">
                                {searchTrim
                                  ? highlightMatch(tableName, tableSearch)
                                  : tableName}
                              </span>
                            </label>
                            <div className="tree-table-actions">
                              <button
                                type="button"
                                className="tree-table-view-btn"
                                onClick={() =>
                                  setPreviewModal({ dbName, tableName })
                                }
                                disabled={syncing}
                                title="View first 50 rows"
                              >
                                View
                              </button>
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
                                onClick={() =>
                                  setFilterDialog({ dbName, tableName })
                                }
                                disabled={syncing}
                                title={
                                  hasFilters
                                    ? `${tableFilters.length} filter(s)`
                                    : "Add filters"
                                }
                              >
                                {hasFilters
                                  ? `Filter (${tableFilters.length})`
                                  : "Filter"}
                              </button>
                            </div>
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
            initialFilters={
              allFilters[
                filterStorageKey(filterDialog.dbName, filterDialog.tableName)
              ] || []
            }
            onClose={() => setFilterDialog(null)}
            onSave={(filters) =>
              handleSaveFilters(
                filterDialog.dbName,
                filterDialog.tableName,
                filters
              )
            }
          />
        )}
        {previewModal && (
          <TablePreviewModal
            dbName={previewModal.dbName}
            tableName={previewModal.tableName}
            onClose={() => setPreviewModal(null)}
          />
        )}
        {databases.length === 0 && (
          <p className="tree-empty">
            No databases found. Check connection or use IS_DEV with
            dev-tables.json.
          </p>
        )}
      </div>
    </div>
  );
}
