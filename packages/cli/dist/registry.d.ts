import type { Registry, RegistryServer } from "./types.js";
export declare function loadRegistry(): Registry;
export declare function getServer(id: string): RegistryServer | undefined;
export declare function searchServers(query: string): Array<[string, RegistryServer]>;
export declare function getAllServers(): Array<[string, RegistryServer]>;
//# sourceMappingURL=registry.d.ts.map