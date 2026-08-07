import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUS } from "../src/constants/domain.js";
import { assertAppointmentTransition, consultationFeeInMinorUnits } from "../src/modules/appointments/appointment.service.js";

describe("appointment lifecycle", () => {
  it("allows the explicit happy-path transitions", () => {
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.PAYMENT_PENDING, APPOINTMENT_STATUS.PENDING)).not.toThrow();
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.ACCEPTED)).not.toThrow();
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.ACCEPTED, APPOINTMENT_STATUS.COMPLETED)).not.toThrow();
  });

  it("rejects state skipping and terminal state changes", () => {
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.COMPLETED)).toThrow(/cannot transition/);
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED)).toThrow(/cannot transition/);
    expect(() => assertAppointmentTransition(APPOINTMENT_STATUS.REJECTED, APPOINTMENT_STATUS.ACCEPTED)).toThrow(/cannot transition/);
  });
});

describe("authoritative payment amount", () => {
  it("converts the persisted doctor's fee to Stripe minor units", () => {
    expect(consultationFeeInMinorUnits(1250.5)).toBe(125050);
  });

  it("rejects corrupted persisted fees", () => {
    expect(() => consultationFeeInMinorUnits(-1)).toThrow(TypeError);
    expect(() => consultationFeeInMinorUnits(Number.NaN)).toThrow(TypeError);
  });
});
