"use strict";

const { getEnvConfig } = require("../config/env");

/**
 * Payload shape per GOFRUGAL_SYNKER_API_PLAN.md:
 * - table_name: string
 * - table_config: array of { name, type?, primaryKey?, autoIncrement?, nullable? }
 * - unique_keys: string[]
 * - table_items: array of row objects (optional, default [])
 */

/**
 * Calls the Gofrugal Synker API to create/update table and sync rows.
 * @param {Object} payload - { table_name, table_config, unique_keys, table_items? }
 * @returns {Promise<{ code: number, msg: string, table?: string, rows?: number }>}
 */
async function syncTable(payload) {
  const { synker } = getEnvConfig();
  const url = `${synker.baseUrl}${synker.syncPath}`;

  const body = {
    table_name: payload.table_name,
    table_config: payload.table_config,
    unique_keys: payload.unique_keys,
    table_items: payload.table_items == null ? [] : payload.table_items,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.msg || data.message || res.statusText;
    const err = new Error(`Synker API error (${res.status}): ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

module.exports = { syncTable };
