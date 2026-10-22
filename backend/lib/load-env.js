import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultBackendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultProjectDirectory = path.dirname(defaultBackendDirectory);

export function loadLocalEnv({
  projectDirectory = defaultProjectDirectory,
  backendDirectory = defaultBackendDirectory
} = {}) {
  const envPath = [
    path.join(projectDirectory, ".env"),
    path.join(backendDirectory, ".env")
  ].find((candidate) => existsSync(candidate));
  if (!envPath) return null;

  const result = dotenv.config({ path: envPath });
  if (result.error) {
    throw new Error(`Could not load local environment file at ${envPath}.`);
  }
  return envPath;
}
