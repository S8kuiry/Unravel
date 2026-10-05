"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/app/config/firebase";
import { getUser } from "@/api/user";
import { UserResponse } from "@/types/user";

type AuthContextType = {
  user: User | null;
  dbUser: UserResponse | null;
  loading: boolean;
  getAuthToken: (forceRefresh?: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  setDbUser: (user: UserResponse | null) => void;
  fetchDbUser: () => Promise<UserResponse | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "unravel_db_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Lazy initialization from LocalStorage on client mount
  const [dbUser, setDbState] = useState<UserResponse | null>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(true);

  // Keep a mutable ref of dbUser to avoid re-subscribing onIdTokenChanged unnecessarily
  const dbUserRef = useRef(dbUser);
  useEffect(() => {
    dbUserRef.current = dbUser;
  }, [dbUser]);

  // Synchronizes dbUser state with LocalStorage
  const setDbUser = useCallback((newUser: UserResponse | null) => {
    setDbState(newUser);
    if (typeof window !== "undefined") {
      if (newUser) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newUser));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, []);

  // Manual re-fetch for backend user details (used after token linking or profile edits)
  const fetchDbUser = useCallback(async (): Promise<UserResponse | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    try {
      const token = await currentUser.getIdToken(true);
      const res = await getUser(token);
      setDbUser(res.user);
      return res.user;
    } catch (error) {
      console.error("Failed to re-fetch backend profile:", error);
      return null;
    }
  }, [setDbUser]);

  const getAuthToken = useCallback(async (forceRefresh = false) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken(forceRefresh);
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setUser(null);
      setDbUser(null);
    }
  }, [setDbUser]);

  // Handle Firebase auth state changes cleanly
  useEffect(() => {
  const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
    setUser(firebaseUser);

    if (!firebaseUser) {
      setDbUser(null);
      setLoading(false);
      return;
    }

    // Firebase authentication is ready.
    // Google/GitHub login handlers are responsible for
    // syncing the user to the backend and calling setDbUser().
    setLoading(false);
  });

  return unsubscribe;
}, [setDbUser]);

  const value = useMemo(
    () => ({
      user,
      dbUser,
      loading,
      getAuthToken,
      logout,
      setDbUser,
      fetchDbUser,
    }),
    [user, dbUser, loading, getAuthToken, logout, setDbUser, fetchDbUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}