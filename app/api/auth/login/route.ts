import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const authService = new AuthService(
      process.env.DREAMFACTORY_URL || 'http://localhost:8080'
    );

    try {
      const session = await authService.login(email, password);

      // Set session token in an HTTP-only cookie
      const cookieStore = cookies();
      cookieStore.set('df_session_token', session.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60, // 1 hour
      });

      return NextResponse.json({
        success: true,
        user: {
          id: session.id,
          email: session.email,
          name: session.name,
          first_name: session.first_name,
          last_name: session.last_name,
          role: session.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid credentials' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      { error: 'Failed to process login request' },
      { status: 500 }
    );
  }
} 