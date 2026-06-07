/**
 * Notification system for ERP
 * Provides functions to create and manage notifications
 */
import { db } from "./firebase";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import type { Notification, Role } from "./types";

/**
 * Create a notification for a specific user
 */
export async function createNotification(input: {
  recipientUid: string;
  recipientRole: Role;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  link?: string;
}): Promise<string> {
  const notificationRef = await addDoc(collection(db, "notifications"), {
    ...input,
    type: input.type || "info",
    read: false,
    createdAt: serverTimestamp(),
  });
  
  return notificationRef.id;
}

/**
 * Create a notification for all users with a specific role
 */
export async function createNotificationForRole(input: {
  recipientRole: Role;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  link?: string;
}): Promise<void> {
  // Get all users with the specified role
  const usersQuery = query(
    collection(db, "users"),
    where("role", "==", input.recipientRole)
  );
  
  const usersSnap = await getDocs(usersQuery);
  
  // Create notifications for each user
  const batch = [];
  for (const userDoc of usersSnap.docs) {
    batch.push(addDoc(collection(db, "notifications"), {
      recipientUid: userDoc.id,
      recipientRole: input.recipientRole,
      title: input.title,
      message: input.message,
      type: input.type || "info",
      read: false,
      createdAt: serverTimestamp(),
    }));
  }
  
  await Promise.all(batch);
}

/**
 * Create a notification for all users
 */
export async function createNotificationForAll(input: {
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  link?: string;
}): Promise<void> {
  // Get all users
  const usersSnap = await getDocs(collection(db, "users"));
  
  // Create notifications for each user
  const batch = [];
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data() as { role: Role };
    batch.push(addDoc(collection(db, "notifications"), {
      recipientUid: userDoc.id,
      recipientRole: userData.role,
      title: input.title,
      message: input.message,
      type: input.type || "info",
      read: false,
      createdAt: serverTimestamp(),
    }));
  }
  
  await Promise.all(batch);
}

/**
 * Notification templates for common ERP events
 */
export const NotificationTemplates = {
  rentGenerated: (memberName: string, month: string) => ({
    title: "Rent Generated",
    message: `Monthly rent for ${month} has been generated for ${memberName}`,
    type: "info" as const,
  }),
  
  paymentReceived: (memberName: string, amount: number) => ({
    title: "Payment Received",
    message: `${memberName} has made a payment of ৳${amount.toLocaleString()}`,
    type: "success" as const,
  }),
  
  monthlyClosing: (month: string) => ({
    title: "Monthly Closing",
    message: `Monthly closing for ${month} has been completed`,
    type: "info" as const,
  }),
  
  changeRequestSubmitted: (title: string) => ({
    title: "Change Request Submitted",
    message: `Your request "${title}" has been submitted for approval`,
    type: "info" as const,
  }),
  
  changeRequestApproved: (title: string) => ({
    title: "Change Request Approved",
    message: `Your request "${title}" has been approved`,
    type: "success" as const,
  }),
  
  changeRequestRejected: (title: string, note?: string) => ({
    title: "Change Request Rejected",
    message: `Your request "${title}" was rejected${note ? `: ${note}` : ""}`,
    type: "error" as const,
  }),
  
  dueReminder: (memberName: string, amount: number) => ({
    title: "Due Reminder",
    message: `${memberName}, you have a due of ৳${amount.toLocaleString()}`,
    type: "warning" as const,
  }),
};