"use client";

import { createContext, useContext } from "react";

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: string;
  memberCount: number;
  appCount: number;
}

export interface UserContextType {
  userId: string;
  name: string;
  email: string;
  hasProfileImage: boolean;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  activeTeamId: string;
  defaultTeamId: string | null;
  teams: TeamInfo[];
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: UserContextType;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
