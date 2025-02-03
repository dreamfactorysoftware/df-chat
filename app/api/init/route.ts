import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DreamFactoryTool } from '@/lib/dreamfactory';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-DreamFactory-API-Key',
    },
  });
}

export async function POST(request: Request) {
  console.log('Received initialization request');
  
  try {
    const body = await request.json();
    console.log('Request body:', { 
      hasApiKey: !!body.apiKey,
      apiKeyLength: body.apiKey?.length
    });

    const { apiKey } = body;

    if (!apiKey) {
      console.log('No API key provided');
      return NextResponse.json(
        { error: 'DreamFactory API key is required' },
        { status: 400 }
      );
    }

    const dreamFactoryUrl = process.env.DREAMFACTORY_URL;
    console.log('Environment check:', {
      hasDreamFactoryUrl: !!dreamFactoryUrl,
      url: dreamFactoryUrl
    });

    if (!dreamFactoryUrl) {
      console.error('DREAMFACTORY_URL is not set in environment variables');
      return NextResponse.json(
        { error: 'DreamFactory URL configuration is missing' },
        { status: 500 }
      );
    }

    // Make a direct test request to DreamFactory
    try {
      console.log('Making test request to DreamFactory');
      const testUrl = `${dreamFactoryUrl}/api/v2/`;  // Changed to root API endpoint
      console.log('Test URL:', testUrl);
      console.log('API Key being used:', apiKey);

      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'X-DreamFactory-API-Key': apiKey,
          'Accept': 'application/json',
        }
      });

      console.log('Test response:', {
        status: testResponse.status,
        ok: testResponse.ok,
        statusText: testResponse.statusText
      });

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('Raw error response:', errorText);
        
        const errorData = JSON.parse(errorText);
        console.error('DreamFactory test request failed:', errorData);
        throw new Error(errorData?.error?.message || 'Failed to validate API key');
      }

      const testData = await testResponse.json();
      console.log('Test request successful:', {
        hasServices: !!testData.services,
        serviceCount: testData.services?.length,
        services: testData.services
      });

      if (!testData.services) {
        throw new Error('No services found in response');
      }

    } catch (error) {
      console.error('Test request failed:', error);
      return NextResponse.json(
        { 
          error: 'Invalid DreamFactory API key',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 401 }
      );
    }

    // If we get here, the API key is valid
    const cookieStore = cookies();
    cookieStore.set('df_api_key', apiKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
    });

    console.log('API key stored in cookie successfully');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to initialize session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 