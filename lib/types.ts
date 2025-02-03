export interface DreamFactorySession {
  apiKey: string;
  sessionId: string;
}

export interface DreamFactoryService {
  id: number;
  name: string;
  label: string;
  description: string;
  type: string;
}

export interface DreamFactorySchema {
  resource?: Array<{ name: string }>;
  service: string[];
  tables?: Record<string, DreamFactoryTableSchema>;
}

export interface DreamFactoryTableSchema {
  name: string;
  label?: string;
  plural?: string;
  primary_key?: string;
  name_field?: string;
  related?: string[];
  fields: DreamFactoryFieldSchema[];
}

export interface DreamFactoryFieldSchema {
  name: string;
  label?: string;
  type: string;
  db_type: string;
  length?: number;
  precision?: number;
  scale?: number;
  required?: boolean;
  allow_null?: boolean;
  fixed_length?: boolean;
  supports_multibyte?: boolean;
  auto_increment?: boolean;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
  ref_table?: string;
  ref_field?: string;
  validation?: Record<string, any>;
  default?: any;
}

export interface DreamFactoryQueryParams {
  filter?: string;
  limit?: number;
  offset?: number;
  order?: string;
  fields?: string[];
  include_count?: boolean;
  include_schema?: boolean;
}

export interface DreamFactoryTableResponse<T = any> {
  resource: T[];
  meta?: {
    schema?: DreamFactoryTableSchema;
    count?: number;
    total?: number;
  };
}

// Common table types for the MySQL service
export interface Employee {
  emp_no: number;
  birth_date: string;
  first_name: string;
  last_name: string;
  gender: 'M' | 'F';
  hire_date: string;
}

export interface Department {
  dept_no: string;
  dept_name: string;
}

export interface DeptEmployee {
  emp_no: number;
  dept_no: string;
  from_date: string;
  to_date: string;
}

export interface DeptManager {
  emp_no: number;
  dept_no: string;
  from_date: string;
  to_date: string;
}

export interface Salary {
  emp_no: number;
  salary: number;
  from_date: string;
  to_date: string;
}

export interface Title {
  emp_no: number;
  title: string;
  from_date: string;
  to_date: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string;
  name?: string;
}

export interface ChatResponse {
  message: string;
  error?: string;
} 