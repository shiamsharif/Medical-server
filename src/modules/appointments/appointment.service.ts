import { APPOINTMENT_STATUS, type AppointmentStatus } from "../../constants/domain.js";
import { conflict } from "../../errors/app-error.js";

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  [APPOINTMENT_STATUS.PAYMENT_PENDING]: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.PENDING]: [
    APPOINTMENT_STATUS.ACCEPTED,
    APPOINTMENT_STATUS.REJECTED,
    APPOINTMENT_STATUS.CANCELLED,
  ],
  [APPOINTMENT_STATUS.ACCEPTED]: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.REJECTED]: [],
  [APPOINTMENT_STATUS.CANCELLED]: [],
  [APPOINTMENT_STATUS.COMPLETED]: [],
};

export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!transitions[from].includes(to)) {
    throw conflict(
      `Appointment cannot transition from ${from} to ${to}`,
      "INVALID_APPOINTMENT_TRANSITION",
    );
  }
}

export function consultationFeeInMinorUnits(persistedDoctorFee: number): number {
  if (!Number.isFinite(persistedDoctorFee) || persistedDoctorFee < 0) {
    throw new TypeError("Persisted consultation fee is invalid");
  }
  return Math.round(persistedDoctorFee * 100);
}
