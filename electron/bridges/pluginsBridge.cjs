/**
 * Plugins Bridge - Manages installed plugin manifests on disk.
 *
 * Safety model:
 * - We persist and enumerate manifest metadata only.
 * - Third-party plugin code is NOT executed.
 */

const fs = require("node:fs");
const path = require("node:path");

let electronModule = null;

const DEFAULT_PLUGIN_MANIFESTS = [
	{
		id: "ai",
		name: "AI",
		version: "1.0.0",
		description: "AI assistant integration (chat + suggestions).",
		homepage: "",
	},
	{
		id: "zebra",
		name: "Zebra Blocks",
		version: "1.0.0",
		description: "Alternate command block background striping.",
		homepage: "",
	},
	{
		id: "commandCandidates",
		name: "Command Candidates",
		version: "1.0.0",
		description: "Shows command/path candidates for faster navigation.",
		homepage: "",
	},
	{
		id: "serverStatus",
		name: "System Status",
		version: "1.0.0",
		description: "Shows CPU/memory/disk status in terminal.",
		homepage: "",
	},
];

function init(deps) {
	electronModule = deps.electronModule;
}

function isValidPluginId(id) {
	return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(id);
}

function getPluginsRoot() {
	const app = electronModule?.app;
	const userData = app?.getPath?.("userData");
	if (!userData) throw new Error("Unable to resolve userData path");
	return path.join(userData, "plugins");
}

async function ensurePluginsRoot() {
	const root = getPluginsRoot();
	await fs.promises.mkdir(root, { recursive: true });
	return root;
}

function pluginDir(id) {
	return path.join(getPluginsRoot(), id);
}

function manifestPath(id) {
	return path.join(pluginDir(id), "manifest.json");
}

async function readManifestFile(filePath) {
	const raw = await fs.promises.readFile(filePath, "utf8");
	const json = JSON.parse(raw);
	if (!json || typeof json !== "object") return null;

	const id = typeof json.id === "string" ? json.id : "";
	const name = typeof json.name === "string" ? json.name : "";
	const version = typeof json.version === "string" ? json.version : "";
	if (!isValidPluginId(id) || !name || !version) return null;

	return {
		id,
		name,
		version,
		description: typeof json.description === "string" ? json.description : undefined,
		homepage: typeof json.homepage === "string" ? json.homepage : undefined,
	};
}

async function writePluginManifest(_event, manifest) {
	if (!manifest || typeof manifest !== "object") throw new Error("Invalid manifest");
	const id = manifest.id;
	if (!isValidPluginId(id)) throw new Error("Invalid plugin id");

	const next = {
		id,
		name: typeof manifest.name === "string" ? manifest.name : "",
		version: typeof manifest.version === "string" ? manifest.version : "",
		description: typeof manifest.description === "string" ? manifest.description : undefined,
		homepage: typeof manifest.homepage === "string" ? manifest.homepage : undefined,
	};

	if (!next.name || !next.version) throw new Error("Invalid plugin manifest: name/version required");

	await ensurePluginsRoot();
	await fs.promises.mkdir(pluginDir(id), { recursive: true });
	await fs.promises.writeFile(manifestPath(id), JSON.stringify(next, null, 2), "utf8");
	return next;
}

async function deletePlugin(_event, payload) {
	const id = payload?.id;
	if (!isValidPluginId(id)) throw new Error("Invalid plugin id");
	const dir = pluginDir(id);
	await fs.promises.rm(dir, { recursive: true, force: true });
	return { ok: true };
}

async function listPlugins() {
	const root = await ensurePluginsRoot();
	let entries = [];
	try {
		entries = await fs.promises.readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}

	const manifests = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const p = path.join(root, entry.name, "manifest.json");
		try {
			const manifest = await readManifestFile(p);
			if (manifest) manifests.push(manifest);
		} catch {
			// ignore
		}
	}

	manifests.sort((a, b) => String(a.name).localeCompare(String(b.name)));
	return manifests;
}

async function ensureDefaultPlugins() {
	await ensurePluginsRoot();
	for (const manifest of DEFAULT_PLUGIN_MANIFESTS) {
		const p = manifestPath(manifest.id);
		try {
			if (fs.existsSync(p)) continue;
			await fs.promises.mkdir(pluginDir(manifest.id), { recursive: true });
			await fs.promises.writeFile(p, JSON.stringify(manifest, null, 2), "utf8");
		} catch (err) {
			console.warn("[Plugins] Failed to ensure default plugin", manifest.id, err?.message || err);
		}
	}
}

function registerHandlers(ipcMain) {
	// Ensure defaults exist as early as possible.
	ensureDefaultPlugins().catch((err) => console.warn("[Plugins] ensureDefaultPlugins failed", err));

	ipcMain.handle("netcatty:plugins:list", async () => listPlugins());
	ipcMain.handle("netcatty:plugins:install", writePluginManifest);
	ipcMain.handle("netcatty:plugins:delete", deletePlugin);
}

module.exports = {
	init,
	registerHandlers,
};