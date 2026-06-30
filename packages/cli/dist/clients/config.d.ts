import type { ClientConfig, McpServerConfig, DetectedClient } from "../types.js";
export declare function readConfig(client: DetectedClient): ClientConfig;
export declare function writeConfig(client: DetectedClient, config: ClientConfig): void;
export declare function addServer(client: DetectedClient, serverId: string, serverConfig: McpServerConfig): void;
export declare function removeServer(client: DetectedClient, serverId: string): boolean;
export declare function listInstalledServers(client: DetectedClient): Record<string, McpServerConfig>;
//# sourceMappingURL=config.d.ts.map