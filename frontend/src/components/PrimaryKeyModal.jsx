import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

export default function PrimaryKeyModal({ dbName, tableName, initialPrimaryKeys = [], onClose, onSave }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set(initialPrimaryKeys));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [colsRes, pkRes] = await Promise.all([
          apiFetch(
            `/api/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/columns`
          ),
          apiFetch(
            `/api/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/primary-key`
          ),
        ]);
        if (cancelled) return;
        if (colsRes.res.ok && colsRes.data.columns) setColumns(colsRes.data.columns);
        if (pkRes.res.ok && Array.isArray(pkRes.data.primaryKeys)) {
          setSelected(new Set(pkRes.data.primaryKeys));
        }
      } catch (_) {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dbName, tableName]);

  function toggleColumn(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSave() {
    onSave(Array.from(selected));
    onClose();
  }

  return (
    <div className="dialog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="primary-key-title">
      <div className="dialog primary-key-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 id="primary-key-title" className="dialog-title">
            Primary key — {tableName}
          </h3>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-desc">
            Select one or more columns as the primary key for sync. Order matters for composite keys. Leave empty to use the schema default.
          </p>
          {loading ? (
            <p className="dialog-loading">Loading columns…</p>
          ) : (
            <div className="primary-key-list">
              {columns.map((col) => (
                <label key={col.name} className="primary-key-item">
                  <input
                    type="checkbox"
                    checked={selected.has(col.name)}
                    onChange={() => toggleColumn(col.name)}
                    aria-label={`Primary key: ${col.name}`}
                  />
                  <span className="primary-key-col-name">{col.name}</span>
                  {col.type && <span className="primary-key-col-type">{col.type}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save primary key
          </button>
        </div>
      </div>
    </div>
  );
}
