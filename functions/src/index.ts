import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Helper to get current month in YYYY-MM format
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Helper to get first day of next month
function getNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

// Helper function to map staff role to service type
function getServiceTypeForStaffRole(role: string): string {
  const mapping: Record<string, string> = {
    cook: "cooking_staff",
    cleaner: "cleaning_staff",
    security: "security_staff",
    helper: "other_services",
    accountant: "other_services",
    manager: "other_services",
  };
  return mapping[role] || "other_services";
}

// Scheduled function: Run on 1st day of every month at 00:00
// Generates rent charges, utility allocations, and staff allocations
// IDEMPOTENT: Will not create duplicate records if already exists
export const generateMonthlyBills = functions.pubsub
  .schedule("0 0 1 * *")
  .timeZone("Asia/Dhaka")
  .onRun(async (context) => {
    const nextMonth = getNextMonth();
    const membersSnapshot = await db.collection("members").where("active", "==", true).get();
    const members = membersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const batch = db.batch();
    let createdCount = 0;

    // 1. Generate rent charges (idempotent - uses set with merge to avoid duplicates)
    for (const member of members) {
      const monthlyRent = (member as { monthlyRent?: number }).monthlyRent || 0;
      if (monthlyRent > 0) {
        const rentRef = db.collection("rent_charges").doc(`${member.id}_${nextMonth}`);
        // Check if already exists to prevent duplicate charges
        const existingSnap = await rentRef.get();
        if (!existingSnap.exists) {
          batch.set(rentRef, {
            memberId: member.id,
            memberName: (member as { name?: string }).name || "",
            month: nextMonth,
            amount: monthlyRent,
            status: "pending",
            paidAmount: 0,
            dueAmount: monthlyRent,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "system",
          });
          createdCount++;
        }
      }
    }

    // 2. Generate utility allocations (simplified: equal split among active members)
    const utilitiesSnapshot = await db
      .collection("utilities")
      .where("ym", "==", nextMonth)
      .get();
    const utilities = utilitiesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    for (const utility of utilities) {
      const utilityData = utility as { id?: string; amount?: number; type?: string };
      const amountPerMember = members.length > 0 ? (utilityData.amount || 0) / members.length : 0;

      for (const member of members) {
        const memberData = member as { id?: string; name?: string; services?: { type: string; enabled: boolean }[] };
        const isSubscribed = memberData.services?.some(
          (s) => s.type === utilityData.type && s.enabled,
        );
        if (!isSubscribed && utilityData.type !== "others") continue;

        // Use composite ID for idempotency: {utilityId}_{memberId}
        const allocationRef = db.collection("utility_allocations").doc(`${utilityData.id}_${memberData.id}`);
        const existingSnap = await allocationRef.get();
        if (!existingSnap.exists) {
          batch.set(allocationRef, {
            utilityId: utilityData.id,
            memberId: memberData.id,
            memberName: memberData.name || "",
            amount: Math.round(amountPerMember * 100) / 100,
            allocationMethod: "equal",
            subscribed: isSubscribed !== false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "system",
          });
        }
      }
    }

    // 3. Generate staff allocations (simplified: equal split among active members)
    const staffSnapshot = await db.collection("staff").where("status", "==", "active").get();
    const staffList = staffSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    for (const staff of staffList) {
      const staffData = staff as { id?: string; name?: string; salary?: number; role?: string };
      const salary = staffData.salary || 0;
      if (salary <= 0) continue;

      const amountPerMember = members.length > 0 ? salary / members.length : 0;

      for (const member of members) {
        const memberData = member as { id?: string; name?: string; services?: { type: string; enabled: boolean }[] };
        const serviceType = getServiceTypeForStaffRole(staffData.role || "");
        const isSubscribed = memberData.services?.some(
          (s) => s.type === serviceType && s.enabled,
        );
        if (!isSubscribed) continue;

        // Use composite ID for idempotency: {staffId}_{memberId}_{month}
        const allocationRef = db.collection("staff_allocations").doc(`${staffData.id}_${memberData.id}_${nextMonth}`);
        const existingSnap = await allocationRef.get();
        if (!existingSnap.exists) {
          batch.set(allocationRef, {
            staffId: staffData.id,
            staffName: staffData.name || "",
            staffRole: staffData.role || "",
            memberId: memberData.id,
            memberName: memberData.name || "",
            amount: Math.round(amountPerMember * 100) / 100,
            month: nextMonth,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "system",
          });
        }
      }
    }

    await batch.commit();
    console.log(`Generated ${createdCount} rent charges and allocations for ${nextMonth}`);
    return { success: true, month: nextMonth, createdCount };
  }
);

// HTTP function to manually trigger bill generation
// IDEMPOTENT: Will not create duplicate records if already exists
export const triggerMonthlyBills = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userDoc = await db.collection("users").doc(context.auth.uid).get();
  const userData = userDoc.data();
  if (userData?.role !== "owner" && userData?.role !== "manager") {
    throw new functions.https.HttpsError("permission-denied", "Only owner/manager can trigger");
  }

  // Call the scheduled function logic
  const nextMonth = getNextMonth();
  const membersSnapshot = await db.collection("members").where("active", "==", true).get();
  const members = membersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const batch = db.batch();
  let createdCount = 0;

  for (const member of members) {
    const monthlyRent = (member as { monthlyRent?: number }).monthlyRent || 0;
    if (monthlyRent > 0) {
      const rentRef = db.collection("rent_charges").doc(`${member.id}_${nextMonth}`);
      // Check if already exists to prevent duplicate charges
      const existingSnap = await rentRef.get();
      if (!existingSnap.exists) {
        batch.set(rentRef, {
          memberId: member.id,
          memberName: (member as { name?: string }).name || "",
          month: nextMonth,
          amount: monthlyRent,
          status: "pending",
          paidAmount: 0,
          dueAmount: monthlyRent,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: context.auth.uid,
        });
        createdCount++;
      }
    }
  }

  await batch.commit();
  return { success: true, month: nextMonth, createdCount };
});

// Firestore trigger: When a payment is made, update rent charge status
export const onPaymentCreated = functions.firestore
  .document("payments/{paymentId}")
  .onCreate(async (snap, context) => {
    const payment = snap.data();
    const memberId = payment.memberId;
    const amount = payment.amount;
    const ym = payment.ym;

    // Find rent charge for this member and month
    const rentRef = db.collection("rent_charges").doc(`${memberId}_${ym}`);
    const rentSnap = await rentRef.get();

    if (rentSnap.exists) {
      const rentData = rentSnap.data() as { paidAmount?: number; dueAmount?: number; status?: string };
      const newPaidAmount = (rentData.paidAmount || 0) + amount;
      const newDueAmount = Math.max(0, (rentData.dueAmount || 0) - amount);
      const newStatus = newDueAmount === 0 ? "paid" : newPaidAmount > 0 ? "partial" : "pending";

      await rentRef.update({
        paidAmount: newPaidAmount,
        dueAmount: newDueAmount,
        status: newStatus,
      });
    }

    return null;
  });

// Firestore trigger: Log activity when important changes happen
export const onMemberCreated = functions.firestore
  .document("members/{memberId}")
  .onCreate(async (snap, context) => {
    const member = snap.data();
    await db.collection("activity_logs").add({
      type: "member",
      entity: "members",
      entityId: context.params.memberId,
      action: "create",
      actorUid: member.createdBy || "system",
      actorName: "System",
      actorRole: "system",
      message: `New member added: ${member.name}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: member.createdBy || "system",
    });
    return null;
  });

export const onRoomCreated = functions.firestore
  .document("rooms/{roomId}")
  .onCreate(async (snap, context) => {
    const room = snap.data();
    await db.collection("activity_logs").add({
      type: "room",
      entity: "rooms",
      entityId: context.params.roomId,
      action: "create",
      actorUid: room.createdBy || "system",
      actorName: "System",
      actorRole: "system",
      message: `New room added: ${room.roomNo}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: room.createdBy || "system",
    });
    return null;
  });

// HTTP function to check if monthly closing exists (for idempotency)
export const checkMonthlyClosing = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userDoc = await db.collection("users").doc(context.auth.uid).get();
  const userData = userDoc.data();
  if (userData?.role !== "owner" && userData?.role !== "manager") {
    throw new functions.https.HttpsError("permission-denied", "Only owner/manager can check");
  }

  const month = data.month as string;
  if (!month) {
    throw new functions.https.HttpsError("invalid-argument", "Month is required");
  }

  const closingRef = db.collection("monthly_closing").doc(month);
  const snap = await closingRef.get();
  
  return { exists: snap.exists, data: snap.exists ? snap.data() : null };
});
