"use strict";

const readline = require("readline");

/**
 * Create a readline interface for stdin/stdout.
 * @returns {readline.Interface}
 */
function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * Ask a single question and resolve with the answer (trimmed).
 * @param {string} question
 * @returns {Promise<string>}
 */
function ask(question) {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || "").trim());
    });
  });
}

module.exports = { ask, createInterface };
