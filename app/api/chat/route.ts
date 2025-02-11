import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DreamFactoryTool } from '@/lib/dreamfactory';
import { OpenAIService } from '@/lib/openai';
import { ChatMessage } from '@/lib/types';
import { AuthService } from '@/lib/auth';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

if (!process.env.SERPER_API_KEY) {
  throw new Error('Missing SERPER_API_KEY environment variable');
}

// Configure for Netlify Edge Functions using new Next.js format
export const runtime = "edge";
export const preferredRegion = ["iad1"];

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const sessionToken = cookieStore.get('df_session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
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
      process.env.DREAMFACTORY_URL || 'http://localhost:8080'
    );

    const openai = new OpenAIService(
      process.env.OPENAI_API_KEY as string,
      dreamFactory,
      process.env.SERPER_API_KEY as string
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an agentic LLM with access to DreamFactory services and real-time web search capabilities.
Your goal is to help users by providing comprehensive answers using:
1. DreamFactory database data
2. Real-time web search results
3. Your general knowledge when appropriate

IMPORTANT: Always follow this EXACT process for EVERY database-related request:

<thinking>
PHASE 1: Schema Discovery (MANDATORY)
1. List Available Services
   - FIRST, call listServices() to see available services
   - Example response: ["sqlserver", "mysql", etc.]
   - Select the appropriate service for your query

2. List Available Tables
   - NEXT, call listTables(serviceName) to get all table names
   - Example: listTables("sqlserver")
   - Example response: ["Application.Cities", "Application.StateProvinces", etc.]
   - NEVER assume table names exist - always verify first

3. Get Table Schemas
   - For EACH relevant table, call getTableSchema(serviceName, tableName)
   - Example: getTableSchema("sqlserver", "Application.Cities")
   - Document available fields and their types
   - Document available relationships
   - Example response:
     {
       "name": "Application.Cities",
       "fields": [
         {"name": "CityID", "type": "integer"},
         {"name": "CityName", "type": "string"},
         {"name": "StateProvinceID", "type": "integer"}
       ],
       "related": [
         "Application.StateProvinces_by_StateProvinceID"
       ]
     }

PHASE 2: Query Construction
1. Use ONLY verified table names and fields from schema
2. Use EXACT relationship names from schema
3. Build filters using verified field names:
   - Single condition: "(CityName='Abbeville')"
   - Multiple conditions: "(CityName='Abbeville') and (StateProvinceID=1)"

PHASE 3: Data Processing
1. Check if response contains data
2. Navigate nested relationships correctly
3. If data is missing, use web search or general knowledge

PHASE 4: Web Search (if needed)
1. Construct clear search queries
2. Use webSearch function
3. Combine with database data
4. Cite sources and timestamps

</thinking>

Then provide your final response in this format:

Answer: [Clear, complete answer combining all data sources as needed]

Data Sources & Details:
1. Schema Discovery:
   - Services Found: [List services checked]
   - Tables Found: [List relevant tables found]
   - Available Fields: [List relevant fields and relationships]

2. Database Results:
   - [What was found in the database]
   - [Data path and relationships used]
   - [If nothing found, explain why]

3. Web Search Results: (if used)
   - [Search results with timestamps]
   - [Source citations]

Query Details:
- Service: [Service name used]
- Tables: [Tables accessed]
- Relationships: [Relationships used]
- Fields: [Fields accessed]

Example Response:
"Answer: Abbeville is in the Southeast sales territory.

Data Sources & Details:
1. Schema Discovery:
   - Services Found: sqlserver
   - Tables Found: Application.Cities, Application.StateProvinces
   - Available Fields: CityName, StateProvinceID, SalesTerritory
   - Relationships: Application.StateProvinces_by_StateProvinceID

2. Database Results:
   - Found: Abbeville in Application.Cities
   - Related: StateProvince data with SalesTerritory field
   - Data Path: Cities → StateProvinces → SalesTerritory

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

    try {
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
      console.error('OpenAI/DreamFactory error:', error);

      // Check if this is a DreamFactory error
      if (error instanceof Error && (
        error.name === 'DreamFactoryError' || 
        (error.message.includes('403') && error.message.includes('Access Forbidden'))
      )) {
        // Extract the component name from the error message if possible
        const componentMatch = error.message.match(/component '([^']+)'/);
        const component = componentMatch ? componentMatch[1] : 'the requested resource';
        
        return NextResponse.json(
          { 
            error: `You don't have permission to access ${component}. Please contact your DreamFactory administrator to request access to this resource.`,
            type: 'permission_denied'
          },
          { status: 403 }
        );
      }

      // Re-throw other errors to be handled by outer catch
      throw error;
    }
  } catch (error) {
    console.error('Chat error:', error);

    // Handle all other errors
    return NextResponse.json(
      { 
        error: 'An error occurred while processing your request. Please try again or contact support if the problem persists.',
        type: 'internal_error'
      },
      { status: 500 }
    );
  }
} 