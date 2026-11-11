import { describe, it, expect } from "vitest";
import { chunkText } from "../../supabase/functions/_shared/chunk";
import { assertPublicHttpUrl } from "../../supabase/functions/_shared/url-safety";
import { parseSseBlock } from "@/lib/chat-stream";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("chunkText", () => {
  it("returns nothing for empty text", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("keeps a short text as one chunk", () => {
    const c = chunkText(words(50));
    expect(c).toHaveLength(1);
    expect(c[0].tokenCount).toBe(50);
  });

  it("uses overlapping windows and covers the whole text", () => {
    const c = chunkText(words(500), 220, 40);
    expect(c.length).toBe(3); // windows start at 0, 180, 360
    expect(c[0].content.split(" ").slice(-40)).toEqual(c[1].content.split(" ").slice(0, 40));
    expect(c[c.length - 1].content.endsWith("w499")).toBe(true);
  });

  it("respects maxChunks", () => {
    expect(chunkText(words(5000), 100, 10, 5)).toHaveLength(5);
  });

  it("rejects overlap >= chunk size", () => {
    expect(() => chunkText("a b c", 10, 10)).toThrow();
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts public sites and adds https when missing", () => {
    expect(assertPublicHttpUrl("example.com/page").href).toBe("https://example.com/page");
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://[::1]/",
    "http://metadata",
    "ftp://example.com",
  ])("blocks %s", (u) => {
    expect(() => assertPublicHttpUrl(u)).toThrow();
  });
});

describe("parseSseBlock", () => {
  it("parses a delta event", () => {
    expect(parseSseBlock('data: {"type":"delta","text":"hi"}')).toEqual({ type: "delta", text: "hi" });
  });
  it("ignores comments and bad JSON", () => {
    expect(parseSseBlock(": keep-alive")).toBeNull();
    expect(parseSseBlock("data: {oops")).toBeNull();
  });
});
