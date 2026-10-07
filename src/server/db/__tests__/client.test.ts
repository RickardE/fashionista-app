import { describe, expect, it } from "vitest";
import { connectionUrl } from "../client";

describe("connectionUrl", () => {
  it("drops libpq-only parameters that postgres.js would send to the server", () => {
    const url = connectionUrl(
      "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(url).toBe("postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require");
  });

  it("leaves local URLs untouched", () => {
    expect(connectionUrl("postgres://styleai:styleai@localhost:5433/styleai")).toBe(
      "postgres://styleai:styleai@localhost:5433/styleai",
    );
  });
});
