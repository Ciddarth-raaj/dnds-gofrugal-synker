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
          <h3 className="dialog-title">Table filters — {tableName}</h3>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-desc">Only rows matching these conditions will be synced. Add filters below (e.g. date range).</p>

          {loading ? (
            <p className="dialog-loading">Loading columns…</p>
          ) : (
            <>
              <section className="filter-section">
                <h4 className="filter-section-title">Active filters</h4>
                <div className="filter-list">
                  {filters.length === 0 ? (
                    <p className="filter-empty">No filters yet. Add one in the form below.</p>
                  ) : (
                    filters.map((f, i) => (
                      <div key={i} className="filter-item">
                        <span className="filter-item-col">{f.column}</span>
                        <span className="filter-item-op">{OPERATORS.find((o) => o.value === f.operator)?.label || f.operator}</span>
                        <span className="filter-item-val">
                          {Array.isArray(f.value) ? `${f.value[0]} … ${f.value[1]}` : String(f.value)}
                        </span>
                        <button type="button" className="filter-remove" onClick={() => removeFilter(i)} aria-label="Remove filter">
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="filter-section filter-add-section">
                <h4 className="filter-section-title">Add a filter</h4>
                <div className="filter-add-grid">
                  <label className="filter-field">
                    <span className="filter-field-label">Column</span>
                    <select
                      className="filter-select"
                      value={newColumn}
                      onChange={(e) => setNewColumn(e.target.value)}
                      aria-label="Column"
                    >
                      <option value="">Select column</option>
                      {columnOptions}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span className="filter-field-label">Condition</span>
                    <select
                      className="filter-select"
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
                  </label>
                  {newOperator === "range" ? (
                    <>
                      <label className="filter-field">
                        <span className="filter-field-label">From</span>
                        <input
                          type={isDateInput ? "date" : "text"}
                          className="filter-input"
                          placeholder="From"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          aria-label="From"
                        />
                      </label>
                      <label className="filter-field">
                        <span className="filter-field-label">To</span>
                        <input
                          type={isDateInput ? "date" : "text"}
                          className="filter-input"
                          placeholder="To"
                          value={newValueEnd}
                          onChange={(e) => setNewValueEnd(e.target.value)}
                          aria-label="To"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="filter-field filter-field-value">
                      <span className="filter-field-label">Value</span>
                      <input
                        type={isDateInput ? "date" : "text"}
                        className="filter-input"
                        placeholder="Value"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        aria-label="Value"
                      />
                    </label>
                  )}
                  <div className="filter-add-btn-wrap">
                    <button type="button" className="btn btn-primary" onClick={addFilter}>
                      Add filter
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

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
