"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "./api";
import type { AuthResponse, User } from "./types";

const TOKEN_KEY = "pulse.token";

type AuthState =
  | { status: "loading"; user: null; token: null }
  | { status: "signed-out"; user: null; token: null }
  | { status: "signed-in"; user: User; token: string };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    displayName?: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = { status: "signed-out", user: null, token: null };

function storeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage is unavailable (private mode): the session lasts until reload.
  }
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    token: null,
  });

  // Restore the session saved by a previous visit.
  useEffect(() => {
    let cancelled = false;
    const token = readToken();
    const restore = token
      ? api.me(token).then(
          (user): AuthState => ({ status: "signed-in", user, token }),
          (error): AuthState => {
            // Only forget the token when the server says it is invalid.
            if (error instanceof ApiError && error.status === 401) {
              storeToken(null);
            }
            return SIGNED_OUT;
          },
        )
      : Promise.resolve(SIGNED_OUT);
    void restore.then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback((response: AuthResponse) => {
    storeToken(response.accessToken);
    setState({
      status: "signed-in",
      user: response.user,
      token: response.accessToken,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (email, password) => accept(await api.login({ email, password })),
      register: async (input) => accept(await api.register(input)),
      logout: () => {
        storeToken(null);
        setState(SIGNED_OUT);
      },
    }),
    [state, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
