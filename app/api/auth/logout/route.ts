import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/lib/auth';

export async function POST() {
  try {
    const authService = new AuthService(
      process.env.DREAMFACTORY_URL || 'http://localhost:8080'
    );

    await authService.logout();

    // Remove the session cookie
    const cookieStore = cookies();
    cookieStore.delete('df_session_token');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to process logout request' },
      { status: 500 }
    );
  }
} 