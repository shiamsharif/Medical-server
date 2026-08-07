import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { paginationMeta, toObjectId } from "../src/utils/validation.js";

describe("request utilities", () => {
  it("rejects malformed ObjectIds before database access", () => {
    expect(() => toObjectId("not-an-id")).toThrow(/Invalid resource identifier/);
  });

  it("accepts valid ObjectIds", () => {
    const id = new ObjectId();
    expect(toObjectId(id.toHexString()).equals(id)).toBe(true);
  });

  it("returns stable pagination metadata", () => {
    expect(paginationMeta(2, 10, 25)).toEqual({
      page: 2, limit: 10, total: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: true,
    });
  });
});
