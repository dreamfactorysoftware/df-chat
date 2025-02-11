import OpenAI from 'openai';
import { ChatMessage } from './types';
import { DreamFactoryTool } from './dreamfactory';
import { SearchService } from './search';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class OpenAIService {
  private openai: OpenAI;
  private dreamFactoryTool: DreamFactoryTool;
  private searchService: SearchService;

  constructor(openaiApiKey: string, dreamFactoryTool: DreamFactoryTool, serperApiKey: string) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.dreamFactoryTool = dreamFactoryTool;
    this.searchService = new SearchService(serperApiKey);
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
    {
      name: 'webSearch',
      description: 'Search the internet for real-time information like weather, news, stock prices, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find real-time information',
          },
        },
        required: ['query'],
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

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-0125-preview',
        messages: messages.map(this.convertToChatMessage),
        functions: this.functions,
        function_call: 'auto',
      });

      const message = response.choices[0].message;

      if (message.function_call) {
        const functionName = message.function_call.name;
        const args = JSON.parse(message.function_call.arguments);

        let functionResult;
        try {
          switch (functionName) {
            case 'webSearch':
              const searchResults = await this.searchService.search(args.query);
              functionResult = SearchService.summarizeResults(searchResults);
              break;
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
        } catch (error) {
          // Preserve DreamFactory error structure
          if (error instanceof Error && error.message.includes('403') && error.message.includes('Access Forbidden')) {
            const dfError = new Error(error.message);
            dfError.name = 'DreamFactoryError';
            throw dfError;
          }
          throw error;
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
      // Preserve DreamFactory error structure when rethrowing
      if (error instanceof Error && (
        error.name === 'DreamFactoryError' || 
        (error.message.includes('403') && error.message.includes('Access Forbidden'))
      )) {
        const dfError = new Error(error.message);
        dfError.name = 'DreamFactoryError';
        throw dfError;
      }
      throw error;
    }
  }
} 