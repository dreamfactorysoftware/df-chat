import OpenAI from 'openai';
import { ChatMessage } from './types';
import { DreamFactoryTool } from './dreamfactory';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class OpenAIService {
  private openai: OpenAI;
  private dreamFactoryTool: DreamFactoryTool;

  constructor(apiKey: string, dreamFactoryTool: DreamFactoryTool) {
    this.openai = new OpenAI({ apiKey });
    this.dreamFactoryTool = dreamFactoryTool;
  }

  private readonly functions = [
    {
      name: 'listServices',
      description: 'List all available DreamFactory services',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'getServiceSchema',
      description: 'Get the schema for a specific service',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service to get the schema for',
          },
        },
        required: ['serviceName'],
      },
    },
    {
      name: 'getTableSchema',
      description: 'Get the schema for a specific table in a service',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service containing the table',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table to get the schema for',
          },
        },
        required: ['serviceName', 'tableName'],
      },
    },
    {
      name: 'listTables',
      description: 'List all available tables in a service. Use this first to find the correct table name before querying.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service to list tables from',
          },
        },
        required: ['serviceName'],
      },
    },
    {
      name: 'queryTable',
      description: 'Query a table in a service with optional related data. Make sure the table exists by using listTables first.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service containing the table (e.g., "sqlserver")',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table to query (e.g., "Application.Cities")',
          },
          queryParams: {
            type: 'object',
            properties: {
              filter: { 
                type: 'string',
                description: 'SQL-like filter string. For multiple conditions, use parentheses and proper spacing. Example: "(CityName=\'Abbeville\') and (StateProvinceID=1)"'
              },
              related: {
                type: 'string',
                description: 'Comma-separated list of related tables to include (e.g., "Application.StateProvinces_by_StateProvinceID")'
              },
              limit: { type: 'number' },
              offset: { type: 'number' },
              order: { type: 'string' },
              fields: { type: 'array', items: { type: 'string' } },
              include_count: { type: 'boolean' },
              include_schema: { type: 'boolean' },
            },
          },
        },
        required: ['serviceName', 'tableName'],
      },
    },
    {
      name: 'searchTableByField',
      description: 'Search any table by a specific field value with optional related data',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service containing the table',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table to search',
          },
          fieldName: {
            type: 'string',
            description: 'The name of the field to search by',
          },
          value: {
            type: ['string', 'number'],
            description: 'The value to search for',
          },
          exact: {
            type: 'boolean',
            description: 'Whether to do an exact match (true) or a "starts with" match (false)',
            default: true,
          },
          related: {
            type: 'string',
            description: 'Comma-separated list of related tables to include',
          },
        },
        required: ['serviceName', 'tableName', 'fieldName', 'value'],
      },
    },
    {
      name: 'searchByName',
      description: 'Search for records by name in first name and last name fields with optional related data',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service (e.g., "sqlserver")',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table (e.g., "Application.Cities")',
          },
          name: {
            type: 'string',
            description: 'The name to search for',
          },
          firstNameField: {
            type: 'string',
            description: 'The field name for first name',
            default: 'first_name',
          },
          lastNameField: {
            type: 'string',
            description: 'The field name for last name',
            default: 'last_name',
          },
          related: {
            type: 'string',
            description: 'Comma-separated list of related tables to include',
          },
        },
        required: ['serviceName', 'tableName', 'name'],
      },
    },
  ];

  private convertToChatMessage(msg: ChatMessage): ChatCompletionMessageParam {
    if (msg.role === 'function') {
      return {
        role: msg.role,
        content: msg.content,
        name: msg.name || 'unknown',
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  }

  async chat(messages: ChatMessage[]): Promise<{ response: string; endpoints: string[] }> {
    try {
      // Clear previous endpoints at the start of each chat
      this.dreamFactoryTool.clearRequestedEndpoints();

      // Add system message to emphasize checking table existence and handling related data
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `You are an agentic LLM with access to DreamFactory services and general knowledge.
Your goal is to help users by providing verified answers using only authorized DreamFactory endpoints and data.

IMPORTANT: Always follow this exact process for EVERY request:

<thinking>
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
   - Build your filter using verified field names
   - Example query structure:
     /_table/{primary_table}?related={relationship_name}&filter={field}={value}

4. Response Processing
   - When you receive the response:
     * The related data will be nested under the relationship name
     * Example: response.resource[0].Application.StateProvinces_by_StateProvinceID.SalesTerritory
     * Always check if response.resource exists and has data
     * Always check if the nested relationship data exists
   - Extract and verify all needed fields
   - If data is missing, explain what was expected vs what was found

5. Answer Construction
   - Start with a clear, direct answer to the question
   - Include the specific values found (e.g., "The sales territory is Southeast")
   - Show the data path: City → State Province → Sales Territory
   - If relevant, include additional context from the related data

</thinking>

Then provide your final response in this format:

Answer: [Direct answer to the question]

Data Details:
- Primary Record: [Key details from the main record]
- Related Data: [Key details from related records]
- Data Path: [How the data was connected]

Query Details:
- Service: [Service name used]
- Tables: [Tables accessed]
- Relationships: [Relationships used]
- Fields: [Fields accessed]

Example Response:
"Answer: Abbeville (StateProvinceID: 1) is in the Southeast sales territory.

Data Details:
- Primary Record: Abbeville (CityID: 6)
- Related Data: State: Alabama, Territory: Southeast
- Data Path: Cities → StateProvinces → SalesTerritory

Query Details:
- Service: sqlserver
- Tables: Application.Cities, Application.StateProvinces
- Relationships: Application.StateProvinces_by_StateProvinceID
- Fields: CityName, StateProvinceID, SalesTerritory"`
      };

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-0125-preview',
        messages: [systemMessage, ...messages].map(this.convertToChatMessage),
        functions: this.functions,
        function_call: 'auto',
      });

      const message = response.choices[0].message;

      if (message.function_call) {
        const functionName = message.function_call.name;
        const args = JSON.parse(message.function_call.arguments);

        let functionResult;
        switch (functionName) {
          case 'listServices':
            functionResult = await this.dreamFactoryTool.listServices();
            break;
          case 'getServiceSchema':
            functionResult = await this.dreamFactoryTool.getServiceSchema(args.serviceName);
            break;
          case 'getTableSchema':
            functionResult = await this.dreamFactoryTool.getTableSchema(args.serviceName, args.tableName);
            break;
          case 'listTables':
            functionResult = await this.dreamFactoryTool.listTables(args.serviceName);
            break;
          case 'queryTable':
            functionResult = await this.dreamFactoryTool.queryTable(
              args.serviceName,
              args.tableName,
              args.queryParams
            );
            break;
          case 'searchTableByField':
            functionResult = await this.dreamFactoryTool.searchTableByField(
              args.serviceName,
              args.tableName,
              args.fieldName,
              args.value,
              args.exact,
              args.related
            );
            break;
          case 'searchByName':
            functionResult = await this.dreamFactoryTool.searchByName(
              args.serviceName,
              args.tableName,
              args.name,
              args.firstNameField,
              args.lastNameField,
              args.related
            );
            break;
          default:
            throw new Error(`Unknown function: ${functionName}`);
        }

        messages.push({
          role: 'assistant',
          content: message.content || '',
        });
        messages.push({
          role: 'function',
          content: JSON.stringify(functionResult),
          name: functionName,
        });

        return this.chat(messages);
      }

      // Get the endpoints that were called
      const endpoints = this.dreamFactoryTool.getRequestedEndpoints();

      return {
        response: message.content || 'No response generated',
        endpoints
      };
    } catch (error) {
      console.error('OpenAI error:', error);
      throw error;
    }
  }
} 