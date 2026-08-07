import { ObjectId } from "mongodb";
import { z } from "zod";
import { badRequest } from "../errors/app-error.js";

export const objectIdSchema = z.string().refine(ObjectId.isValid, "Invalid MongoDB ObjectId");
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm");
export const dateSchema = z.iso.date();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export function toObjectId(value: string | string[]): ObjectId {
  const normalized = Array.isArray(value) ? value[0] ?? "" : value;
  if (!ObjectId.isValid(normalized)) throw badRequest("Invalid resource identifier", "INVALID_OBJECT_ID");
  return new ObjectId(normalized);
}

export function paginationMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}
