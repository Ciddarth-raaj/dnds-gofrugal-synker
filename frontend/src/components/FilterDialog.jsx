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

/** Stored in filter value; resolved to actual date at sync time on the server. */
export const DATE_TODAY = "@TODAY";
export const DATE_YESTERDAY = "@YESTERDAY";

function isDateLikeType(type) {
  if (!type) return false;
  const t = String(type).toUpperCase();
  return t.includes("DATE") || t.includes("TIME");
}

function formatFilterValueDisplay(val) {
  if (val === DATE_TODAY) return "Today";
  if (val === DATE_YESTERDAY) return "Yesterday";
  return String(val);
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
    const value =
      newOperator === "range"
        ? [newValue.trim() || null, newValueEnd.trim() || null].filter((v) => v != null && v !== "")
        : newValue.trim();
    if (newOperator === "range" && (!Array.isArray(value) || value.length < 2)) return;
    if (newOperator !== "range" && (value === "" || value == null)) return;
    setFilters((prev) => [...prev, { column: newColumn, operator: newOperator, value }]);
    setNewColumn("");
    setNewOperator("eq");
    setNewValue("");
    setNewValueEnd("");
  }

  function removeFilter(index) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  const hasUnsavedNewFilter =
    newColumn !== "" || newValue.trim() !== "" || newValueEnd.trim() !== "";

  function handleSave() {
    if (hasUnsavedNewFilter) return;
    onSave(filters);
    onClose();
  }

  function handleClose() {
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
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog filter-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Table filters — {tableName}</h3>
          <button type="button" className="dialog-close" onClick={handleClose} aria-label="Close">
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
                          {Array.isArray(f.value)
                            ? `${formatFilterValueDisplay(f.value[0])} … ${formatFilterValueDisplay(f.value[1])}`
                            : formatFilterValueDisplay(f.value)}
                        </span>
                        <button type="button" className="filter-remove" onClick={() => removeFilter(i)} aria-label="Remove filter">
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {hasUnsavedNewFilter && (
                <p className="filter-unsaved-warning" role="alert">
                  You have entered filter criteria that haven't been added. Click &quot;Add filter&quot; to include them, or your changes will not be saved.
                </p>
              )}
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
                      <label className="filter-field filter-field-range-from">
                        <span className="filter-field-label">From</span>
                        {isDateInput && (
                          <div className="filter-date-quick">
                            <button
                              type="button"
                              className={`filter-date-quick-btn${newValue === DATE_TODAY ? " filter-date-quick-btn--selected" : ""}`}
                              onClick={() => setNewValue((prev) => (prev === DATE_TODAY ? "" : DATE_TODAY))}
                              aria-pressed={newValue === DATE_TODAY}
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              className={`filter-date-quick-btn${newValue === DATE_YESTERDAY ? " filter-date-quick-btn--selected" : ""}`}
                              onClick={() => setNewValue((prev) => (prev === DATE_YESTERDAY ? "" : DATE_YESTERDAY))}
                              aria-pressed={newValue === DATE_YESTERDAY}
                            >
                              Yesterday
                            </button>
                          </div>
                        )}
                        <input
                          type={isDateInput ? "date" : "text"}
                          className="filter-input"
                          placeholder="Or pick date"
                          value={newValue === DATE_TODAY || newValue === DATE_YESTERDAY ? "" : newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          aria-label="From"
                        />
                      </label>
                      <label className="filter-field filter-field-range-to">
                        <span className="filter-field-label">To</span>
                        {isDateInput && (
                          <div className="filter-date-quick">
                            <button
                              type="button"
                              className={`filter-date-quick-btn${newValueEnd === DATE_TODAY ? " filter-date-quick-btn--selected" : ""}`}
                              onClick={() => setNewValueEnd((prev) => (prev === DATE_TODAY ? "" : DATE_TODAY))}
                              aria-pressed={newValueEnd === DATE_TODAY}
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              className={`filter-date-quick-btn${newValueEnd === DATE_YESTERDAY ? " filter-date-quick-btn--selected" : ""}`}
                              onClick={() => setNewValueEnd((prev) => (prev === DATE_YESTERDAY ? "" : DATE_YESTERDAY))}
                              aria-pressed={newValueEnd === DATE_YESTERDAY}
                            >
                              Yesterday
                            </button>
                          </div>
                        )}
                        <input
                          type={isDateInput ? "date" : "text"}
                          className="filter-input"
                          placeholder="Or pick date"
                          value={newValueEnd === DATE_TODAY || newValueEnd === DATE_YESTERDAY ? "" : newValueEnd}
                          onChange={(e) => setNewValueEnd(e.target.value)}
                          aria-label="To"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="filter-field filter-field-value">
                      <span className="filter-field-label">Value</span>
                      {isDateInput && (
                        <div className="filter-date-quick">
                          <button
                            type="button"
                            className={`filter-date-quick-btn${newValue === DATE_TODAY ? " filter-date-quick-btn--selected" : ""}`}
                            onClick={() => setNewValue((prev) => (prev === DATE_TODAY ? "" : DATE_TODAY))}
                            aria-pressed={newValue === DATE_TODAY}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            className={`filter-date-quick-btn${newValue === DATE_YESTERDAY ? " filter-date-quick-btn--selected" : ""}`}
                            onClick={() => setNewValue((prev) => (prev === DATE_YESTERDAY ? "" : DATE_YESTERDAY))}
                            aria-pressed={newValue === DATE_YESTERDAY}
                          >
                            Yesterday
                          </button>
                        </div>
                      )}
                      <input
                        type={isDateInput ? "date" : "text"}
                        className="filter-input"
                        placeholder={isDateInput ? "Or pick date" : "Value"}
                        value={newValue === DATE_TODAY || newValue === DATE_YESTERDAY ? "" : newValue}
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
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={hasUnsavedNewFilter}>
            Save filters
          </button>
        </div>
      </div>
    </div>
  );
}
