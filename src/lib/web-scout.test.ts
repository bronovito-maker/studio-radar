import { describe, expect, it } from "vitest";
import { isPrivateIpAddress, mapWithConcurrency } from "./web-scout-utils";

describe("web scout network safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "172.16.1.2",
    "192.168.1.3",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
  ])("blocks private address %s", (address) => {
    expect(isPrivateIpAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => expect(isPrivateIpAddress(address)).toBe(false),
  );
});

describe("bounded concurrency", () => {
  it("keeps ordering and never exceeds the requested concurrency", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
