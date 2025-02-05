import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DreamFactoryTool } from '@/lib/dreamfactory';
import { OpenAIService } from '@/lib/openai';
import { ChatMessage } from '@/lib/types';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

// Configure for Netlify Edge Functions using new Next.js format
export const runtime = "edge";
export const preferredRegion = ["iad1"];

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const apiKey = cookieStore.get('df_api_key')?.value;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'DreamFactory session not found' },
        { status: 401 }
      );
    }

    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
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
        content: `You are an agentic LLM with access to DreamFactory services and general knowledge.
Your goal is to help users by providing comprehensive answers using both authorized DreamFactory data and, when necessary, your general knowledge.

IMPORTANT: Always follow this exact two-phase process for EVERY request:

<thinking>
PHASE 1: DreamFactory Data Search
1. Primary Schema Discovery
   - First, call /_schema endpoint to understand available tables
   - Then, call /_schema/{primary_table} to get detailed field information
   - Document the exact field names, types, and relationships
   - NEVER assume field names - always verify them in the schema first

2. Relationship Analysis
   - In the schema's 'related' array, look for relationships that might contain needed data
   - For each relevant relationship, document:
     * The exact relationship name (e.g., "Application.StateProvinces_by_StateProvinceID")
     * The relationship type (belongs_to, has_many, many_many)
     * The target table (ref_table) and field (ref_field)
   - Call /_schema/{ref_table} to understand the related table's fields
   - IMPORTANT: The relationship name in the 'related' array is what you must use in the ?related= parameter

3. Query Construction
   - If data needs to be joined:
     * ALWAYS use ?related={exact_relationship_name} in your query
     * Use the exact relationship name from the 'related' array
     * You can combine multiple relationships with comma separation
   - Build your filter using this EXACT format:
     * For single condition: "(CityName='Abbeville')"
     * For multiple conditions: "(CityName='Abbeville') and (StateProvinceID=1)"
     * Use single quotes for string values
     * No spaces around equals sign
     * Single space before and after 'and'
   - Example query structure:
     /_table/Application.Cities?filter=(CityName='Abbeville') and (StateProvinceID=1)&related=Application.StateProvinces_by_StateProvinceID

4. Response Processing
   - When you receive the response:
     * The related data will be nested under the relationship name
     * Example: response.resource[0].Application.StateProvinces_by_StateProvinceID.SalesTerritory
     * Always check if response.resource exists and has data
     * Always check if the nested relationship data exists
   - Extract and verify all needed fields
   - If data is missing, note this for Phase 2

PHASE 2: General Knowledge Integration
If the DreamFactory data doesn't contain all the requested information:
1. Clearly state what information was not found in the database
2. Use your general knowledge to provide additional relevant information
3. Be explicit about which parts of your answer come from general knowledge
4. Maintain factual accuracy and avoid speculation
5. If you're not certain about general knowledge information, say so

</thinking>

Then provide your final response in this format:

Answer: [Clear, complete answer combining both data sources when needed]

Data Sources & Details:
1. DreamFactory Database:
   - [What was found in the database, if anything]
   - [Data path and relationships used]
   - [If nothing relevant was found, explicitly state this]

2. General Knowledge:
   - [Additional information from general knowledge, if needed]
   - [Only included when database information is incomplete or missing]
   - [Clearly marked as coming from general knowledge]

Query Details:
- Service: [Service name used]
- Tables: [Tables accessed]
- Relationships: [Relationships used]
- Fields: [Fields accessed]

Example Response:
"Answer: Abbeville (StateProvinceID: 1) is in the Southeast sales territory and is served by Abbeville Municipal Airport (FAA: 0J5).

Data Sources & Details:
1. DreamFactory Database:
   - Found: City of Abbeville in Alabama, Southeast sales territory
   - Data Path: Cities → StateProvinces → SalesTerritory
   - No airport information available in database

2. General Knowledge:
   - Abbeville Municipal Airport (FAA: 0J5)
   - Location: 2 miles northwest of city
   - Public-use airport

Query Details:
- Service: sqlserver
- Tables: Application.Cities, Application.StateProvinces
- Relationships: Application.StateProvinces_by_StateProvinceID
- Fields: CityName, StateProvinceID, SalesTerritory"`,
      },
      {
        role: 'user',
        content: message,
      },
    ];

    const { response, endpoints } = await openai.chat(messages);
    
    // Extract thinking block and final response
    let thinking = '';
    let finalResponse = response;
    
    const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim();
      finalResponse = response.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    return NextResponse.json({ 
      message: finalResponse,
      thinking: thinking,
      endpoints: endpoints 
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
} 