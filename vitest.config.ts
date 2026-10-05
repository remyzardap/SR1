import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Tests run from the repo root. vite.config.ts sets `root: client` for the app build, so
// without this file `vitest run` only found the client tests.
//
// One config, three suites picked by mode:
//   npm test           (default) unit tests: server, shared and client
//   npm run test:db    (--mode db)  *.db.test.ts against TEST_DATABASE_URL; each file skips when it is unset
//   npm run test:e2e   (--mode e2e) server/e2e.test.ts, which hits the live deployment
const SUITES = {
  unit: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "client/src/**/*.test.ts"],
    exclude: ["server/e2e.test.ts", "**/*.db.test.ts"],
  },
  db: {
    include: ["server/**/*.db.test.ts", "shared/**/*.db.test.ts"],
    exclude: [],
  },
  e2e: {
    include: ["server/e2e.test.ts"],
    exclude: [],
  },
};

export default defineConfig(({ mode }) => {
  const suite = mode === "db" ? SUITES.db : mode === "e2e" ? SUITES.e2e : SUITES.unit;
  return {
    root: import.meta.dirname,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    test: {
      environment: "node",
      include: suite.include,
      exclude: [...configDefaults.exclude, ...suite.exclude],
      // The db suite shares one database, so its files run one at a time.
      fileParallelism: mode !== "db",
    },
  };
});
