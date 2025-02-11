import { cookies } from 'next/headers';

const API_KEY = 'daf9692e1ec76c2623f3c1e5a951590a902931a2a8900d53520040fa04f8786c';

interface DreamFactorySession {
  session_token: string;
  id: number;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  last_login_date: string;
  host: string;
  role: string;
}

export class AuthService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async login(email: string, password: string): Promise<DreamFactorySession> {
    const response = await fetch(`${this.baseUrl}/api/v2/user/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DreamFactory-API-Key': API_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to authenticate');
    }

    const session = await response.json();
    return session;
  }

  async logout(): Promise<void> {
    const cookieStore = cookies();
    const sessionToken = cookieStore.get('df_session_token')?.value;

    if (sessionToken) {
      try {
        await fetch(`${this.baseUrl}/api/v2/user/session`, {
          method: 'DELETE',
          headers: {
            'X-DreamFactory-API-Key': API_KEY,
            'X-DreamFactory-Session-Token': sessionToken,
          },
        });
      } catch (error) {
        console.error('Error during logout:', error);
      }
    }
  }

  static getSessionToken(): string | undefined {
    const cookieStore = cookies();
    return cookieStore.get('df_session_token')?.value;
  }
} 