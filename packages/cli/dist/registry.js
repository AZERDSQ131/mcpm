import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _registry = null;
export function loadRegistry() {
    if (_registry)
        return _registry;
    const require = createRequire(import.meta.url);
    const registryPath = path.resolve(__dirname, "../../../packages/registry/registry.json");
    _registry = require(registryPath);
    return _registry;
}
export function getServer(id) {
    const registry = loadRegistry();
    return registry.servers[id];
}
export function searchServers(query) {
    const registry = loadRegistry();
    const q = query.toLowerCase();
    return Object.entries(registry.servers).filter(([id, server]) => {
        return (id.includes(q) ||
            server.name.toLowerCase().includes(q) ||
            server.description.toLowerCase().includes(q) ||
            server.tags.some((t) => t.includes(q)));
    });
}
export function getAllServers() {
    const registry = loadRegistry();
    return Object.entries(registry.servers);
}
//# sourceMappingURL=registry.js.map