import base from "../../vitest.config";

const config = {
  ...base,
  test: { ...base.test, include: ["scripts/capacity/match-discussions.test.ts"], testTimeout: 180_000 },
};

export default config;
