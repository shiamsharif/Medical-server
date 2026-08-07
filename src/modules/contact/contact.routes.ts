import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../config/database.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";

const schema = z.object({
  name: z.string().trim().min(2).max(100), email: z.email(), subject: z.string().trim().min(3).max(200), message: z.string().trim().min(10).max(5000),
});
export const contactRouter = Router();
contactRouter.post("/", validateBody(schema), asyncHandler(async (request, response) => {
  const createdAt = new Date();
  const result = await getDatabase().collection("contacts").insertOne({ ...request.body, createdAt });
  success(response, { id: result.insertedId, createdAt }, "Message received", 201);
}));
