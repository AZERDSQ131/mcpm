import fs from "fs";
import path from "path";
export function readConfig(client) {
    if (!fs.existsSync(client.configPath)) {
        return { mcpServers: {} };
    }
    try {
        const raw = fs.readFileSync(client.configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed.mcpServers)
            parsed.mcpServers = {};
        return parsed;
    }
    catch {
        return { mcpServers: {} };
    }
}
export function writeConfig(client, config) {
    const dir = path.dirname(client.configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(client.configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
function buildServerConfig(client, serverConfig) {
    if (client.id === "claude") {
        return { type: "stdio", ...serverConfig };
    }
    return serverConfig;
}
export function addServer(client, serverId, serverConfig) {
    const config = readConfig(client);
    config.mcpServers[serverId] = buildServerConfig(client, serverConfig);
    writeConfig(client, config);
}
export function removeServer(client, serverId) {
    const config = readConfig(client);
    if (!config.mcpServers[serverId])
        return false;
    delete config.mcpServers[serverId];
    writeConfig(client, config);
    return true;
}
export function listInstalledServers(client) {
    const config = readConfig(client);
    return config.mcpServers;
}
//# sourceMappingURL=config.js.map