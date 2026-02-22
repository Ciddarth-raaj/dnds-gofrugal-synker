import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

const OPERATORS = [
  { value: "eq", label: "Equal to" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal" },
  { value: "range", label: "Range (between)" },
];

function isDateLikeType(type) {
  if (!type) return false;
  const t = String(type).toUpperCase();
  return t.includes("DATE") || t.includes("TIME");
}

export default function FilterDialog({ dbName, tableName, initialFilters = [], onClose, onSave }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => JSON.parse(JSON.stringify(initialFilters)));
  const [newColumn, setNewColumn] = useState("");
  const [newOperator, setNewOperator] = useState("eq");
  const [newValue, setNewValue] = useState("");
  const [newValueEnd, setNewValueEnd] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { res, data } = await apiFetch(
          `/api/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/columns`
        );
        if (!cancelled && res.ok && data.columns) setColumns(data.columns);
      } catch (_) {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dbName, tableName]);

  function addFilter() {
    if (!newColumn) return;
    const col = columns.find((c) => c.name === newColumn);
    const isDate = col && isDateLikeType(col.type);
    const value =
      newOperator === "range"
        ? [newValue.trim() || null, newValueEnd.trim() || null].filter((v) => v != null && v !== "")
        : newValue.trim();
    if (newOperator === "range" && (!Array.isArray(value) || value.length < 2)) return;
    if (newOperator !== "range" && (value === "" || value == null)) return;
    setFilters((prev) => [...prev, { column: newColumn, operator: newOperator, value }]);
    setNewValue("");
    setNewValueEnd("");
  }

  function removeFilter(index) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    onSave(filters);
    onClose();
  }

  const columnOptions = columns.map((c) => (
    <option key={c.name} value={c.name}>
      {c.name} ({c.type})
    </option>
  ));
  const selectedCol = columns.find((c) => c.name === newColumn);
  const isDateInput = selectedCol && isDateLikeType(selectedCol.type);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog filter-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Filters — {tableName}</h3>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="dialog-desc">Sync will only include rows matching these conditions. Useful for date ranges.</p>

        {loading ? (
          <p className="dialog-loading">Loading columns…</p>
        ) : (
          <>
            <div className="filter-list">
              {filters.length === 0 && (
                <p className="filter-empty">No filters. Add one below.</p>
              )}
              {filters.map((f, i) => (
                <div key={i} className="filter-item">
                  <span className="filter-item-col">{f.column}</span>
                  <span className="filter-item-op">{OPERATORS.find((o) => o.value === f.operator)?.label || f.operator}</span>
                  <span className="filter-item-val">
                    {Array.isArray(f.value) ? `${f.value[0]} … ${f.value[1]}` : String(f.value)}
                  </span>
                  <button type="button" className="filter-remove" onClick={() => removeFilter(i)} aria-label="Remove">
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="filter-add">
              <label className="filter-add-label">Add filter</label>
              <div className="filter-add-row">
                <select
                  className="filter-select filter-col"
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  aria-label="Column"
                >
                  <option value="">Select column</option>
                  {columnOptions}
                </select>
                <select
                  className="filter-select filter-op"
                  value={newOperator}
                  onChange={(e) => setNewOperator(e.target.value)}
                  aria-label="Operator"
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {newOperator === "range" ? (
                  <>
                    <input
                      type={isDateInput ? "date" : "text"}
                      className="filter-input filter-val"
                      placeholder="From"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      aria-label="From"
                    />
                    <input
                      type={isDateInput ? "date" : "text"}
                      className="filter-input filter-val"
                      placeholder="To"
                      value={newValueEnd}
                      onChange={(e) => setNewValueEnd(e.target.value)}
                      aria-label="To"
                    />
                  </>
                ) : (
                  <input
                    type={isDateInput ? "date" : "text"}
                    className="filter-input filter-val"
                    placeholder="Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    aria-label="Value"
                  />
                )}
                <button type="button" className="btn btn-primary filter-add-btn" onClick={addFilter}>
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save filters
          </button>
        </div>
      </div>
    </div>
  );
}
