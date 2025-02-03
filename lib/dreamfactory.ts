import { DreamFactoryService, DreamFactorySchema, DreamFactoryQueryParams, DreamFactoryTableResponse, Employee, Department, DeptEmployee, DeptManager, Salary, Title } from './types';

interface QueryParams {
  filter?: string;
  limit?: number;
  offset?: number;
  order?: string;
  fields?: string[];
  include_count?: boolean;
  include_schema?: boolean;
}

interface DreamFactoryResponse<T> {
  resource: T[];
  meta?: {
    count?: number;
    schema?: any;
  };
}

export class DreamFactoryTool {
  private apiKey: string;
  private baseUrl: string;
  private cachedSchema: Record<string, DreamFactorySchema> = {};
  private cachedTableSchemas: Record<string, Record<string, any>> = {};

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    console.log('DreamFactoryTool initialized with:', {
      baseUrl: this.baseUrl,
    });
  }

  private async makeRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${this.baseUrl}/api/v2/${cleanEndpoint}`;
    
    console.log('Making request to:', url);
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'X-DreamFactory-API-Key': this.apiKey,
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('DreamFactory API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          url,
        });
        throw new Error(
          errorData?.error?.message || 
          errorData?.error || 
          `Failed to fetch from DreamFactory: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log('Response data:', data);
      return data;
    } catch (error) {
      console.error('DreamFactory Request Failed:', {
        url,
        error,
      });
      throw error;
    }
  }

  async listServices(): Promise<DreamFactoryService[]> {
    const response = await this.makeRequest<{ services: DreamFactoryService[] }>('');
    return response.services || [];
  }

  async getServiceSchema(serviceName: string): Promise<DreamFactorySchema> {
    if (!this.cachedSchema[serviceName]) {
      console.log(`Fetching schema for service: ${serviceName}`);
      this.cachedSchema[serviceName] = await this.makeRequest<DreamFactorySchema>(`${serviceName}/_schema`);
      console.log('Service schema:', this.cachedSchema[serviceName]);
    }
    return this.cachedSchema[serviceName];
  }

  async getTableSchema(serviceName: string, tableName: string): Promise<any> {
    const cacheKey = `${serviceName}/${tableName}`;
    if (!this.cachedTableSchemas[cacheKey]) {
      console.log(`Fetching schema for table: ${tableName}`);
      this.cachedTableSchemas[cacheKey] = await this.makeRequest(`${serviceName}/_schema/${tableName}`);
      console.log('Table schema:', this.cachedTableSchemas[cacheKey]);
    }
    return this.cachedTableSchemas[cacheKey];
  }

  async listTables(serviceName: string): Promise<string[]> {
    const schema = await this.getServiceSchema(serviceName);
    if (!schema.resource) return [];
    return schema.resource
      .filter(table => !table.name.startsWith('_'))
      .map(table => table.name);
  }

  async findTableWithField(serviceName: string, fieldName: string): Promise<string | null> {
    const tables = await this.listTables(serviceName);
    
    for (const tableName of tables) {
      const schema = await this.getTableSchema(serviceName, tableName);
      if (schema.field?.some((field: any) => field.name.toLowerCase() === fieldName.toLowerCase())) {
        return tableName;
      }
    }
    return null;
  }

  async queryTable<T = any>(
    serviceName: string,
    tableName: string,
    queryParams: QueryParams = {}
  ): Promise<DreamFactoryResponse<T>> {
    // First verify the table exists
    const tables = await this.listTables(serviceName);
    if (!tables.includes(tableName)) {
      console.error(`Table "${tableName}" does not exist in service "${serviceName}". Available tables:`, tables);
      throw new Error(`Table "${tableName}" does not exist in service "${serviceName}". Available tables: ${tables.join(', ')}`);
    }

    const params = new URLSearchParams();
    
    if (queryParams.filter) {
      params.append('filter', queryParams.filter);
    }
    if (queryParams.limit) {
      params.append('limit', queryParams.limit.toString());
    }
    if (queryParams.offset) {
      params.append('offset', queryParams.offset.toString());
    }
    if (queryParams.order) {
      params.append('order', queryParams.order);
    }
    if (queryParams.fields) {
      params.append('fields', queryParams.fields.join(','));
    }
    if (queryParams.include_count !== undefined) {
      params.append('include_count', queryParams.include_count.toString());
    }
    if (queryParams.include_schema !== undefined) {
      params.append('include_schema', queryParams.include_schema.toString());
    }

    const endpoint = `${serviceName}/_table/${tableName}${params.toString() ? '?' + params.toString() : ''}`;
    console.log('Querying table with endpoint:', endpoint);
    return this.makeRequest<DreamFactoryResponse<T>>(endpoint);
  }

  // Helper method to search any table by field value
  async searchTableByField(
    serviceName: string,
    tableName: string,
    fieldName: string,
    value: string | number,
    exact: boolean = true
  ): Promise<DreamFactoryResponse<any>> {
    const filter = exact 
      ? `${fieldName} = '${value}'`
      : `${fieldName} like '${value}%'`;
    
    return this.queryTable(serviceName, tableName, { filter });
  }

  async searchByName(
    serviceName: string,
    tableName: string,
    name: string,
    firstNameField: string = 'first_name',
    lastNameField: string = 'last_name'
  ): Promise<DreamFactoryResponse<any>> {
    // First verify the table exists
    const tables = await this.listTables(serviceName);
    if (!tables.includes(tableName)) {
      throw new Error(`Table "${tableName}" does not exist in service "${serviceName}". Available tables: ${tables.join(', ')}`);
    }

    // Then verify the fields exist in the schema
    const schema = await this.getTableSchema(serviceName, tableName);
    const fields = schema.field?.map((f: any) => f.name) || [];
    
    if (!fields.includes(firstNameField) || !fields.includes(lastNameField)) {
      throw new Error(`Fields "${firstNameField}" and/or "${lastNameField}" do not exist in table "${tableName}". Available fields: ${fields.join(', ')}`);
    }

    // Split the name into parts and build the filter
    const terms = name.split(' ').filter(term => term.length > 0);
    let filter: string;
    
    if (terms.length >= 2) {
      // If we have at least two terms, assume first name and last name
      filter = `(${firstNameField} like '${terms[0]}%') and (${lastNameField} like '${terms[1]}%')`;
    } else {
      // If we only have one term, search both fields
      filter = `${firstNameField} like '${terms[0]}%' or ${lastNameField} like '${terms[0]}%'`;
    }
    
    console.log('Using name search filter:', filter);
    return this.queryTable(serviceName, tableName, { filter });
  }

  // Other table methods...
  async queryDepartments(queryParams: DreamFactoryQueryParams = {}): Promise<DreamFactoryTableResponse<Department>> {
    await this.getTableSchema('mysql', 'departments');
    return this.queryTable<Department>('mysql', 'departments', queryParams);
  }

  async queryDeptEmployees(queryParams: DreamFactoryQueryParams = {}): Promise<DreamFactoryTableResponse<DeptEmployee>> {
    await this.getTableSchema('mysql', 'dept_emp');
    return this.queryTable<DeptEmployee>('mysql', 'dept_emp', queryParams);
  }

  async queryDeptManagers(queryParams: DreamFactoryQueryParams = {}): Promise<DreamFactoryTableResponse<DeptManager>> {
    await this.getTableSchema('mysql', 'dept_manager');
    return this.queryTable<DeptManager>('mysql', 'dept_manager', queryParams);
  }

  async querySalaries(queryParams: DreamFactoryQueryParams = {}): Promise<DreamFactoryTableResponse<Salary>> {
    await this.getTableSchema('mysql', 'salaries');
    return this.queryTable<Salary>('mysql', 'salaries', queryParams);
  }

  async queryTitles(queryParams: DreamFactoryQueryParams = {}): Promise<DreamFactoryTableResponse<Title>> {
    await this.getTableSchema('mysql', 'titles');
    return this.queryTable<Title>('mysql', 'titles', queryParams);
  }

  // Deprecated - use queryTable instead
  async runQuery(serviceName: string, queryParams: DreamFactoryQueryParams = {}) {
    console.warn('runQuery is deprecated. Please use queryTable instead.');
    const queryString = new URLSearchParams();
    
    if (queryParams.filter) queryString.append('filter', queryParams.filter);
    if (queryParams.limit) queryString.append('limit', queryParams.limit.toString());
    if (queryParams.offset) queryString.append('offset', queryParams.offset.toString());
    if (queryParams.order) queryString.append('order', queryParams.order);
    if (queryParams.fields) queryString.append('fields', queryParams.fields.join(','));

    const endpoint = `${serviceName}${queryString.toString() ? `?${queryString.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }
} 