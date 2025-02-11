import { DreamFactoryService, DreamFactorySchema, DreamFactoryQueryParams, DreamFactoryTableResponse, Employee, Department, DeptEmployee, DeptManager, Salary, Title } from './types';
import { AuthService } from './auth';

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

const API_KEY = 'daf9692e1ec76c2623f3c1e5a951590a902931a2a8900d53520040fa04f8786c';

export class DreamFactoryTool {
  private baseUrl: string;
  private cachedSchema: Record<string, DreamFactorySchema> = {};
  private cachedTableSchemas: Record<string, Record<string, any>> = {};
  private requestedEndpoints: string[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.requestedEndpoints = [];
    console.log('DreamFactoryTool initialized with:', {
      baseUrl: this.baseUrl,
    });
  }

  getRequestedEndpoints(): string[] {
    return this.requestedEndpoints;
  }

  clearRequestedEndpoints(): void {
    this.requestedEndpoints = [];
  }

  private async makeRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${this.baseUrl}/api/v2/${cleanEndpoint}`;
    
    this.requestedEndpoints.push(`${this.baseUrl}/api/v2/${cleanEndpoint}`);
    console.log('Making request to:', url);
    
    const sessionToken = AuthService.getSessionToken();
    if (!sessionToken) {
      throw new Error('No active session found');
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'X-DreamFactory-API-Key': API_KEY,
          'X-DreamFactory-Session-Token': sessionToken,
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
    params: {
      filter?: string;
      limit?: number;
      offset?: number;
      order?: string;
      fields?: string[];
      include_count?: boolean;
      include_schema?: boolean;
      related?: string;
    } = {}
  ): Promise<DreamFactoryResponse<T>> {
    const queryParams = new URLSearchParams();

    if (params.filter) {
      let formattedFilter = params.filter
        .replace(/\s*=\s*/g, '=')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\s+and\s+/gi, ' and ');

      if (!formattedFilter.startsWith('(')) {
        formattedFilter = `(${formattedFilter})`;
      }

      queryParams.set('filter', formattedFilter);
    }

    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.offset) queryParams.set('offset', params.offset.toString());
    if (params.order) queryParams.set('order', params.order);
    if (params.fields) queryParams.set('fields', params.fields.join(','));
    if (params.include_count) queryParams.set('include_count', 'true');
    if (params.include_schema) queryParams.set('include_schema', 'true');
    if (params.related) queryParams.set('related', params.related);

    const endpoint = `${serviceName}/_table/${tableName}${
      queryParams.toString() ? `?${queryParams.toString()}` : ''
    }`;

    return this.makeRequest<DreamFactoryResponse<T>>(endpoint);
  }

  async searchTableByField(
    serviceName: string,
    tableName: string,
    fieldName: string,
    value: string | number,
    exact: boolean = true,
    related?: string
  ): Promise<DreamFactoryResponse<any>> {
    const filter = exact
      ? `(${fieldName}=${typeof value === 'string' ? `'${value}'` : value})`
      : `(${fieldName} like '${value}%')`;

    return this.queryTable(serviceName, tableName, {
      filter,
      related,
      include_schema: true,
    });
  }

  async searchByName(
    serviceName: string,
    tableName: string,
    name: string,
    firstNameField: string = 'first_name',
    lastNameField: string = 'last_name',
    related?: string
  ): Promise<DreamFactoryResponse<any>> {
    const nameParts = name.split(' ');
    let filter: string;

    if (nameParts.length > 1) {
      // If name has multiple parts, search both first and last name
      filter = `(${firstNameField} like '${nameParts[0]}%') and (${lastNameField} like '${nameParts[1]}%')`;
    } else {
      // If single name part, search in both fields
      filter = `(${firstNameField} like '${name}%') or (${lastNameField} like '${name}%')`;
    }

    return this.queryTable(serviceName, tableName, {
      filter,
      related,
      include_schema: true,
    });
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