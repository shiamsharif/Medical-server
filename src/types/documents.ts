import type { ObjectId } from "mongodb";
import type {
  AppointmentStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  VerificationStatus,
} from "../constants/domain.js";

export interface AppUser {
  _id?: ObjectId;
  authUserId: string;
  name: string;
  email: string;
  image?: string;
  phone?: string;
  gender?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Doctor {
  _id?: ObjectId;
  userId: ObjectId;
  doctorName: string;
  specialization: string;
  qualifications: string[];
  experience: number;
  consultationFee: number;
  hospitalName: string;
  profileImage?: string;
  biography?: string;
  availableDays: string[];
  verificationStatus: VerificationStatus;
  averageRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Schedule {
  _id?: ObjectId;
  doctorId: ObjectId;
  day: string;
  startTime: string;
  endTime: string;
  slotDuration: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Appointment {
  _id?: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  appointmentDate: string;
  appointmentTime: string;
  symptoms: string;
  appointmentStatus: AppointmentStatus;
  paymentStatus: PaymentStatus;
  consultationFeeSnapshot: number;
  paymentId?: ObjectId;
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  _id?: ObjectId;
  appointmentId: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  amount: number;
  currency: string;
  stripePaymentIntentId: string;
  transactionId?: string;
  paymentStatus: PaymentStatus;
  paymentDate?: Date;
  processedEventIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  _id?: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  appointmentId: ObjectId;
  rating: number;
  reviewText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Prescription {
  _id?: ObjectId;
  doctorId: ObjectId;
  patientId: ObjectId;
  appointmentId: ObjectId;
  diagnosis: string;
  medications: Medication[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
