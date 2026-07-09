export interface EnvVar {
  description: string;
  required: boolean;
  secret?: boolean;
}

export interface RegistryServer {
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, EnvVar>;
  tags: string[];
  runtime?: "node" | "python" | "docker" | "deno" | "go";
}

export interface RegistryBundle {
  name: string;
  description: string;
  servers: string[];
}

export interface Registry {
  version: string;
  servers: Record<string, RegistryServer>;
  bundles: Record<string, RegistryBundle>;
}

export interface McpServerConfig {
  type?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClientConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface DetectedClient {
  id: string;
  name: string;
  configPath: string;
  detected: boolean;
}

export interface ExportFormat {
  version: string;
  exportedAt: string;
  servers: Record<string, McpServerConfig>;
}
