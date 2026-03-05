export interface UserSessionData {
  userId: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  activeTeamId: string;
}
