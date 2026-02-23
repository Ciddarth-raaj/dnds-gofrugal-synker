import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

export default function TablePreviewModal({ dbName, tableName, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const { res, data } = await apiFetch(
          `/api/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/preview?limit=50`
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Failed to load preview");
          setRows([]);
          return;
        }
        setRows(data.rows || []);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load preview");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dbName, tableName]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="dialog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="dialog-card table-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 id="preview-title" className="dialog-title">
            Preview: {dbName} → {tableName}
          </h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dialog-body table-preview-body">
          {loading && <p className="table-preview-loading">Loading first 50 rows…</p>}
          {error && <p className="table-preview-error">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="table-preview-empty">No rows in this table.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="table-preview-scroll">
              <div className="table-preview-scroll-inner">
                <table className="table-preview-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="table-preview-th">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col} className="table-preview-td">
                          {row[col] == null ? (
                            <span className="table-preview-null">NULL</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <span className="table-preview-meta">
            Showing up to 50 rows · {columns.length} column{columns.length !== 1 ? "s" : ""}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
