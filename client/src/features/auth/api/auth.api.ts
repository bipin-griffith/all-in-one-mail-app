import { api } from '@/lib/axios';

import type { AuthUser } from '@/store/authStore';
import type { ApiSuccess } from '@/types/api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  const { data } = await api.post<ApiSuccess<AuthResult>>('/auth/login', payload);
  return data.data;
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const { data } = await api.post<ApiSuccess<AuthResult>>('/auth/register', payload);
  return data.data;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<ApiSuccess<AuthUser>>('/auth/me');
  return data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export function googleLoginUrl(): string {
  return `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
}
