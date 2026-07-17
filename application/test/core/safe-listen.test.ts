import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warnOnPortCollision } from "../../src/core/safe-listen.js";

describe("warnOnPortCollision", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("logs instead of crashing when the port is already taken", async () => {
    const first = createServer((_req, res) => res.end("first"));
    await new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve));
    const { port } = first.address() as AddressInfo;

    const second = createServer((_req, res) => res.end("second"));
    warnOnPortCollision(second, "test server", port, "127.0.0.1");
    second.listen(port, "127.0.0.1");

    await new Promise((resolve) => second.on("error", resolve));

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not bind 127.0.0.1"));

    // the winner is unaffected — still serving on the contested port
    const res = await fetch(`http://127.0.0.1:${port}`);
    expect(await res.text()).toBe("first");

    await new Promise<void>((resolve) => first.close(() => resolve()));
  });

  it("rethrows non-EADDRINUSE errors", () => {
    const server = createServer();
    warnOnPortCollision(server, "test server", 0, "127.0.0.1");

    expect(() => server.emit("error", Object.assign(new Error("boom"), { code: "EOTHER" }))).toThrow("boom");
  });
});
