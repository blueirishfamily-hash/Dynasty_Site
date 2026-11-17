// Tests that need the separate test database (.env.test): npm run test:db
// They start the real server, write real rows to the TEST database, and fake Sleeper. They skip themselves
// when there is no .env.test, and refuse a database that matches the real one (see server/testDb.ts).
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["server/integration/**/*.itest.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
