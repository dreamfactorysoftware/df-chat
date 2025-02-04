import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DreamFactoryTool } from '@/lib/dreamfactory';
import { OpenAIService } from '@/lib/openai';
import { ChatMessage } from '@/lib/types';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

export const maxDuration = 300; // Set max duration to 300 seconds for Netlify

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const apiKey = cookieStore.get('df_api_key')?.value;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'DreamFactory session not found' }),
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
    }

    const { message } = await request.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
    }

    const dreamFactory = new DreamFactoryTool(
      apiKey,
      process.env.DREAMFACTORY_URL || 'http://localhost:8080'
    );

    const openai = new OpenAIService(
      process.env.OPENAI_API_KEY as string,
      dreamFactory
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an agentic LLM with access to DreamFactory services.
Your goal is to help users by providing verified answers using only authorized DreamFactory endpoints and data.

For each user request, structure your thinking process like this:
<thinking>
1. Available Resources
   - List discovered DreamFactory services and tables
   - Note relevant schema information
   
2. Query Plan
   - Endpoints to be called
   - Required filters and parameters
   - Expected data format
   
3. Verification Steps
   - How response data will be validated
   - Any cross-referencing needed
   - Data quality checks
</thinking>

Then provide your final response, followed by:

Data Sources:
- List of endpoints called
- Brief summary of data retrieved
- Any relevant constraints or limitations

Guidelines:
- Never expose API keys, credentials, or internal system details
- Only use endpoints you have explicit permission to access
- If data seems incomplete or incorrect, acknowledge limitations
- For any assumptions made, explicitly state them
- Always validate table existence before querying
- Use proper filters and parameters as per DreamFactory specifications`,
      },
      {
        role: 'user',
        content: message,
      },
    ];

    const response = await openai.chat(messages);
    
    // Extract thinking block and final response
    let thinking = '';
    let finalResponse = response;
    
    const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim();
      finalResponse = response.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    // Use standard Response object instead of NextResponse
    return new Response(
      JSON.stringify({ 
        message: finalResponse,
        thinking: thinking 
      }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat message' }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
} 