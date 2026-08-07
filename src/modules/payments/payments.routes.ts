import { Router, raw } from "express";
import Stripe from "stripe";
import { authenticate, requireActiveUser, requireRole } from "../../auth/auth.middleware.js";
import { getDatabase } from "../../config/database.js";
import { requireIntegration } from "../../config/env.js";
import { APPOINTMENT_STATUS, PAYMENT_STATUS, USER_ROLE } from "../../constants/domain.js";
import type { Appointment, Payment } from "../../types/documents.js";
import { badRequest, notFound } from "../../errors/app-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { success } from "../../utils/response.js";
import {
  paginationMeta,
  paginationOffset,
  paginationSchema,
  toObjectId,
} from "../../utils/validation.js";

export const stripeWebhookRouter = Router();
export const paymentsRouter = Router();

stripeWebhookRouter.post(
  "/",
  raw({ type: "application/json" }),
  asyncHandler(async (request, response) => {
    const signature = request.header("stripe-signature");
    if (!signature || !Buffer.isBuffer(request.body)) {
      throw badRequest("Missing Stripe signature", "INVALID_WEBHOOK_SIGNATURE");
    }
    const stripe = new Stripe(requireIntegration("STRIPE_SECRET_KEY"));
    // Signature verification requires the exact bytes Stripe sent, before express.json modifies them.
    const event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      requireIntegration("STRIPE_WEBHOOK_SECRET"),
    );
    if (
      event.type !== "payment_intent.succeeded" &&
      event.type !== "payment_intent.payment_failed"
    ) {
      return response.json({ received: true });
    }
    const intent = event.data.object as Stripe.PaymentIntent;
    const payment = await getDatabase()
      .collection<Payment>("payments")
      .findOne({ stripePaymentIntentId: intent.id });
    if (!payment) {
      throw notFound("Payment");
    }
    const succeeded = event.type === "payment_intent.succeeded";
    const chargeId =
      typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    const paymentFields = succeeded
      ? {
          paymentStatus: PAYMENT_STATUS.PAID,
          paymentDate: new Date(),
          ...(chargeId ? { transactionId: chargeId } : {}),
          updatedAt: new Date(),
        }
      : { paymentStatus: PAYMENT_STATUS.FAILED, updatedAt: new Date() };
    // $addToSet records retried event IDs while all state assignments remain naturally idempotent.
    await getDatabase()
      .collection<Payment>("payments")
      .updateOne(
        { _id: payment._id },
        {
          $set: paymentFields,
          $addToSet: { processedEventIds: event.id },
        },
      );
    if (succeeded) {
      await getDatabase()
        .collection<Appointment>("appointments")
        .updateOne(
          { _id: payment.appointmentId, appointmentStatus: APPOINTMENT_STATUS.PAYMENT_PENDING },
          {
            $set: {
              paymentStatus: PAYMENT_STATUS.PAID,
              appointmentStatus: APPOINTMENT_STATUS.PENDING,
              updatedAt: new Date(),
            },
          },
        );
    } else {
      // A failed attempt may be retried on the same PaymentIntent. Keep its slot reserved until
      // the payment succeeds or the patient explicitly cancels the appointment.
      await getDatabase()
        .collection<Appointment>("appointments")
        .updateOne(
          { _id: payment.appointmentId, appointmentStatus: APPOINTMENT_STATUS.PAYMENT_PENDING },
          { $set: { paymentStatus: PAYMENT_STATUS.FAILED, updatedAt: new Date() } },
        );
    }
    response.json({ received: true });
  }),
);

paymentsRouter.get(
  "/mine",
  authenticate,
  requireActiveUser,
  requireRole(USER_ROLE.PATIENT),
  asyncHandler(async (request, response) => {
    const query = paginationSchema.parse(request.query);
    const filter = { patientId: request.principal!.appUserId };
    const collection = getDatabase().collection<Payment>("payments");
    const [data, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(paginationOffset(query.page, query.limit))
        .limit(query.limit)
        .project({ processedEventIds: 0 })
        .toArray(),
      collection.countDocuments(filter),
    ]);
    response.json({ success: true, data, meta: paginationMeta(query.page, query.limit, total) });
  }),
);

paymentsRouter.get(
  "/:appointmentId",
  authenticate,
  requireActiveUser,
  asyncHandler(async (request, response) => {
    const appointmentId = toObjectId(request.params.appointmentId ?? "");
    const appointment = await getDatabase()
      .collection<Appointment>("appointments")
      .findOne({ _id: appointmentId });
    if (
      !appointment ||
      (request.principal!.role === USER_ROLE.PATIENT &&
        !appointment.patientId.equals(request.principal!.appUserId))
    ) {
      throw notFound("Payment");
    }
    const payment = await getDatabase()
      .collection<Payment>("payments")
      .findOne({ appointmentId }, { projection: { processedEventIds: 0 } });
    if (!payment) {
      throw notFound("Payment");
    }
    success(response, payment);
  }),
);
