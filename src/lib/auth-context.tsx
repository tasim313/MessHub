import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  auth,
  db,
  getSecondaryAuth,
  googleProvider,
  type AppUser,
  type Role,
  type UserStatus,
} from "./firebase";
import {
  findMemberByUid,
  setDocIn,
  withoutUndefined,
  type Member,
} from "./data";

interface AuthCtx {
  user: User | null;
  profile: AppUser | null;
  profileError: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    name: string,
    requestedRole?: Role,
  ) => Promise<void>;
  adminCreateUser: (payload: {
    email: string;
    password: string;
    name: string;
    role: Role;
  }) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  can: (action: "all" | "manage" | "view") => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

async function loadOrCreateProfile(
  u: User,
  nameOverride?: string,
  requestedRole?: Role,
  /**
   * Only true when called from an already-authenticated owner's
   * adminCreateUser action — in that case the requested role comes from a
   * trusted actor (gated by the /admin page itself, owner-only) and should
   * be honored as-is. The public signup flow must NEVER trust an arbitrary
   * self-selected role beyond "manager", to prevent privilege escalation.
   */
  trustRequestedRole: boolean = false,
): Promise<AppUser> {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  let profile: AppUser;

  if (snap.exists()) {
    profile = { uid: u.uid, ...(snap.data() as Omit<AppUser, "uid">) };
  } else {
    const ownerSnap = await getDoc(doc(db, "meta", "owner"));
    const isFirst = !ownerSnap.exists();
    const role: Role = isFirst
      ? "owner"
      : trustRequestedRole && requestedRole
        ? requestedRole
        : requestedRole === "manager"
          ? "manager"
          : "member";
    profile = {
      uid: u.uid,
      email: u.email,
      name: nameOverride || u.displayName || u.email?.split("@")[0] || "User",
      role,
      status: "active",
      active: true,
      photoURL: u.photoURL,
      createdAt: Date.now(),
      createdBy: u.uid,
    };
    await setDoc(
      ref,
      withoutUndefined({ ...profile, createdAtServer: serverTimestamp() }),
    );
    if (isFirst) {
      await setDoc(doc(db, "meta", "owner"), {
        uid: u.uid,
        at: serverTimestamp(),
        createdBy: u.uid,
      });
    }
  }

  const existingMember = await findMemberByUid(u.uid);
  const memberPayload: Omit<Member, "id"> = {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    uid: u.uid,
    active:
      profile.status !== "removed" &&
      profile.status !== "suspended" &&
      profile.active !== false,
    joinedAt: profile.createdAt || Date.now(),
    createdBy: u.uid,
  };

  if (existingMember) {
    await setDocIn("members", existingMember.id, memberPayload);
  } else {
    await setDocIn("members", u.uid, memberPayload);
  }

  await setDoc(
    ref,
    withoutUndefined({
      ...profile,
      email: u.email,
      name: nameOverride || u.displayName || profile.name,
      photoURL: u.photoURL,
      status: (profile.status || "active") as UserStatus,
      active:
        profile.status === "removed" || profile.status === "suspended"
          ? false
          : (profile.active ?? true),
      lastLoginAt: Date.now(),
      lastLoginAtServer: serverTimestamp(),
      lastLoginDevice:
        typeof window !== "undefined" ? navigator.userAgent : "server",
    }),
    { merge: true },
  );

  return {
    ...profile,
    email: u.email,
    name: nameOverride || u.displayName || profile.name,
    photoURL: u.photoURL,
    status: profile.status || "active",
    active:
      profile.status === "removed" || profile.status === "suspended"
        ? false
        : (profile.active ?? true),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await loadOrCreateProfile(u);
          if (
            p.status === "suspended" ||
            p.status === "removed" ||
            p.active === false
          ) {
            await signOut(auth);
            setProfile(null);
            setProfileError(
              p.status === "removed"
                ? "Your account has been removed by the admin."
                : "Your account has been suspended by the admin.",
            );
            setLoading(false);
            return;
          }
          setProfile(p);
          setProfileError(null);
        } catch (e) {
          console.error("profile load failed", e);
          setProfile({
            uid: u.uid,
            email: u.email,
            name: u.displayName || u.email?.split("@")[0] || "User",
            role: "member",
            photoURL: u.photoURL,
          });
          setProfileError((e as Error).message || "Profile sync failed");
        }
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value: AuthCtx = {
    user,
    profile,
    profileError,
    loading,
    login: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signup: async (email, password, name, requestedRole) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await loadOrCreateProfile(cred.user, name, requestedRole);
    },
    adminCreateUser: async ({ email, password, name, role }) => {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );
      await updateProfile(cred.user, { displayName: name });
      await loadOrCreateProfile(cred.user, name, role, true);
      await signOut(secondaryAuth);
    },
    loginGoogle: async () => {
      await signInWithPopup(auth, googleProvider);
    },
    logout: async () => {
      await signOut(auth);
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email);
    },
    can: (action) => {
      if (!profile) return false;
      if (profile.role === "owner") return true;
      if (
        ["manager", "accountant", "bazar_manager", "meal_manager"].includes(
          profile.role,
        )
      )
        return action !== "all";
      return action === "view";
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
