export interface EnvVar {
    description: string;
    required: boolean;
}
export interface RegistryServer {
    name: string;
    description: string;
    command: string;
    args: string[];
    env: Record<string, EnvVar>;
    tags: string[];
}
export interface Registry {
    version: string;
    servers: Record<string, RegistryServer>;
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
//# sourceMappingURL=types.d.ts.map