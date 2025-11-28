#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const usersFile = path.join(dataDir, "users-backfill.json");
const pendingFile = path.join(dataDir, "pending-transfers-backfill.json");
const envFile = path.join(rootDir, ".env");
const dryRun = process.argv.includes("--dry-run");

const parseEnvFile = (contents) => {
  const result = {};
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return;
      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim().replace(/^"|"$/g, "");
      result[key] = value;
    });
  return result;
};

const loadEnv = () => {
  let fileEnv = {};
  if (fs.existsSync(envFile)) {
    fileEnv = parseEnvFile(fs.readFileSync(envFile, "utf-8"));
  }

  return {
    ...fileEnv,
    ...process.env,
  };
};

const ensureFetch = () => {
  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }
  throw new Error("Global fetch is not available. Please run on Node 18+.");
};

const loadJsonArray = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    console.warn(`⚠️ ${path.basename(filePath)} is not an array. Skipping.`);
    return [];
  } catch (error) {
    console.warn(`⚠️ Failed to parse ${path.basename(filePath)}:`, error.message);
    return [];
  }
};

const main = async () => {
  const env = loadEnv();
  const fetchImpl = ensureFetch();

  const apiBaseUrl = env.METASEND_API_BASE_URL || "https://metasend.vercel.app";
  const apiKey = env.METASEND_API_KEY;

  if (!apiKey) {
    console.error("❌ METASEND_API_KEY not set. Add it to .env or pass it inline.");
    process.exit(1);
  }

  const users = loadJsonArray(usersFile);
  const pendingTransfers = loadJsonArray(pendingFile);

  if (!users.length && !pendingTransfers.length) {
    console.log("ℹ️ Nothing to backfill. Add data to data/users-backfill.json or data/pending-transfers-backfill.json");
    return;
  }

  const request = async (endpoint, method, body) => {
    if (dryRun) {
      console.log(`[dry-run] ${method} ${endpoint}`, body);
      return;
    }

    const response = await fetchImpl(`${apiBaseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
    }

    return response.json();
  };

  if (users.length) {
    console.log(`👥 Backfilling ${users.length} user(s)...`);
    for (const user of users) {
      await request("/api/users", "POST", user);
      console.log(`   • ${user.email} synced`);
    }
  }

  if (pendingTransfers.length) {
    console.log(`💸 Backfilling ${pendingTransfers.length} pending transfer(s)...`);
    for (const transfer of pendingTransfers) {
      await request("/api/pending-transfers", "POST", transfer);
      console.log(`   • ${transfer.recipientEmail} queued (${transfer.amount} ${transfer.token})`);
    }
  }

  console.log("✅ Backfill complete");
};

main().catch((error) => {
  console.error("❌ Backfill failed:", error.message);
  process.exit(1);
});
