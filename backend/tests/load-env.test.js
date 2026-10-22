import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadLocalEnv } from "../lib/load-env.js";

const testVariable = "GADGETVERSE_ENV_LOADER_TEST";

async function withTempDirectories(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gadgetverse-env-test-"));
  const projectDirectory = path.join(directory, "project");
  const backendDirectory = path.join(projectDirectory, "backend");
  await mkdir(backendDirectory, { recursive: true });
  const original = process.env[testVariable];

  try {
    delete process.env[testVariable];
    await callback({ projectDirectory, backendDirectory });
  } finally {
    if (original === undefined) delete process.env[testVariable];
    else process.env[testVariable] = original;
    await rm(directory, { recursive: true, force: true });
  }
}

test("loadLocalEnv prefers project-root .env and preserves existing process variables", async () => {
  await withTempDirectories(async ({ projectDirectory, backendDirectory }) => {
    await writeFile(path.join(projectDirectory, ".env"), `${testVariable}=root-test-value\n`);
    await writeFile(path.join(backendDirectory, ".env"), `${testVariable}=backend-test-value\n`);
    process.env[testVariable] = "existing-process-value";

    const loadedPath = loadLocalEnv({ projectDirectory, backendDirectory });

    assert.strictEqual(loadedPath, path.join(projectDirectory, ".env"));
    assert.strictEqual(process.env[testVariable], "existing-process-value");
  });
});

test("loadLocalEnv reads backend .env only when project-root .env is absent", async () => {
  await withTempDirectories(async ({ projectDirectory, backendDirectory }) => {
    await writeFile(path.join(backendDirectory, ".env"), `${testVariable}=backend-test-value\n`);

    const loadedPath = loadLocalEnv({ projectDirectory, backendDirectory });

    assert.strictEqual(loadedPath, path.join(backendDirectory, ".env"));
    assert.strictEqual(process.env[testVariable], "backend-test-value");
  });
});

test("loadLocalEnv does not load .env.example", async () => {
  await withTempDirectories(async ({ projectDirectory, backendDirectory }) => {
    await writeFile(path.join(projectDirectory, ".env.example"), `${testVariable}=template-value\n`);

    const loadedPath = loadLocalEnv({ projectDirectory, backendDirectory });

    assert.strictEqual(loadedPath, null);
    assert.strictEqual(process.env[testVariable], undefined);
  });
});
