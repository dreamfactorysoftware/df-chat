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
      description: 'Query a table in a service. Make sure the table exists by using listTables first.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service containing the table (e.g., "mysql")',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table to query (e.g., "employees"). Must be a table that exists in the service.',
          },
          queryParams: {
            type: 'object',
            properties: {
              filter: { 
                type: 'string',
                description: 'SQL-like filter string (e.g., "first_name like S%" or "emp_no = 123")'
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
      description: 'Search any table by a specific field value',
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
        },
        required: ['serviceName', 'tableName', 'fieldName', 'value'],
      },
    },
    {
      name: 'searchByName',
      description: 'Search for records by name in first name and last name fields. Use this for employee searches in the employees table.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service (e.g., "mysql")',
          },
          tableName: {
            type: 'string',
            description: 'The name of the table (e.g., "employees")',
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

  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      // Add system message to emphasize checking table existence
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Before querying any table:
1. Use listTables to verify the table exists
2. Use the correct service name (e.g., "mysql")
3. Use the exact table name from the schema
4. Never make assumptions about table names`
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
              args.exact
            );
            break;
          case 'searchByName':
            functionResult = await this.dreamFactoryTool.searchByName(
              args.serviceName,
              args.tableName,
              args.name,
              args.firstNameField,
              args.lastNameField
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

      return message.content || 'No response generated';
    } catch (error) {
      console.error('OpenAI error:', error);
      throw new Error('Failed to generate response');
    }
  }
} 