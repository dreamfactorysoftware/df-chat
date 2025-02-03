interface SchemaField {
  name: string;
  type: string;
  db_type: string;
  length?: number;
  required?: boolean;
  label?: string;
}

interface TableSchema {
  field: SchemaField[];
  related?: any[];
  primary?: any;
}

export class DreamFactoryTool {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async getTableSchema(serviceName: string, tableName: string): Promise<TableSchema> {
    const endpoint = `${serviceName}/_schema/${tableName}`;
    return this.get(endpoint);
  }

  private async get(endpoint: string): Promise<any> {
    const url = `${this.baseUrl}/api/v2/${endpoint}`;
    const headers = {
      'X-DreamFactory-API-Key': this.apiKey,
      'Accept': 'application/json'
    };
    
    console.log(`Making request to: ${url}`);
    const response = await fetch(url, { headers });
    return response.json();
  }

  async searchTable(serviceName: string, tableName: string, searchTerm: string): Promise<any> {
    const schema = await this.getTableSchema(serviceName, tableName);
    
    if (!schema || !schema.field) {
      throw new Error(`Could not get schema for table ${tableName}`);
    }

    // Find all string fields in the schema that we can search
    const stringFields = schema.field
      .filter((field: SchemaField) => field.type === 'string' && !field.name.startsWith('_'));

    if (stringFields.length === 0) {
      throw new Error(`No searchable string fields found in table ${tableName}`);
    }

    // Check if this looks like a full name search (contains a space)
    const terms = searchTerm.trim().split(/\s+/);
    let filter: string;

    if (terms.length > 1) {
      // This looks like a full name search - try to match terms against name fields
      const nameFields = stringFields
        .filter(field => field.label?.toLowerCase().includes('name') || field.name.toLowerCase().includes('name'));

      if (nameFields.length >= 2) {
        // We have at least two name fields, build an AND condition
        const conditions = [];
        for (let i = 0; i < Math.min(terms.length, nameFields.length); i++) {
          conditions.push(`(${nameFields[i].name} like '${terms[i]}%')`);
        }
        filter = conditions.join(' and ');
      } else {
        // Fall back to searching all string fields with OR conditions
        filter = stringFields
          .map(field => terms.map(term => `(${field.name} like '${term}%')`).join(' or '))
          .join(' or ');
      }
    } else {
      // Single term search - search across all string fields
      filter = stringFields
        .map(field => `(${field.name} like '${searchTerm}%')`)
        .join(' or ');
    }
    
    const encodedFilter = encodeURIComponent(filter);
    const endpoint = `${serviceName}/_table/${tableName}?filter=${encodedFilter}`;
    
    console.log(`Searching fields: ${stringFields.map(f => f.name).join(', ')}`);
    console.log(`Using filter: ${filter}`);
    console.log(`Querying table with endpoint: ${endpoint}`);
    
    return this.get(endpoint);
  }
} 