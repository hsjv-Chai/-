import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
const { file, query, values, signal } = workerData;
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
parentPort!.postMessage({ ready: true });
Atomics.wait(new Int32Array(signal), 0, 0);
try {
  parentPort!.postMessage({
    changes: Number(db.prepare(query).run(...values).changes),
  });
} catch (error) {
  parentPort!.postMessage({ error: (error as Error).message });
} finally {
  db.close();
}
