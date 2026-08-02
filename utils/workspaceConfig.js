import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "..", "workspace.json");

const DEFAULT_CONFIG = {
  name: "RealTime Workspace",
  logo: null,
};

export const getWorkspace = () => {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    return { ...DEFAULT_CONFIG };
  }
};

export const setWorkspace = (patch = {}) => {
  const current = getWorkspace();
  const next = { ...current, ...patch };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
  return next;
};
