import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import axios from 'axios';
import { randomUUID } from 'crypto';

interface Config {
    storageJsonPath: string;
    msDeviceIdPath: string;
    addyApiKey: string;
    addyApiUrl: string;
    aliasDescription: string;
    aliasDomain: string;
    aliasFormat: string;
    recipientIds: string[];
}

export function activate(context: vscode.ExtensionContext) {
    // Register command for refreshing Cursor identifiers
    let identifiersCommand = vscode.commands.registerCommand('cursor-refresher.refreshIdentifiers', async () => {
        try {
            const config = loadConfig();
            await refreshCursorIdentifiers(config);
            vscode.window.showInformationMessage('Cursor identifiers have been refreshed successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing Cursor identifiers: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Register command for refreshing email alias
    let emailCommand = vscode.commands.registerCommand('cursor-refresher.refreshEmail', async () => {
        try {
            const config = loadConfig();
            if (!config.addyApiKey) {
                throw new Error('Addy.io API key is required');
            }
            const newEmail = await refreshAddyAliases(config);
            
            const copyAction = 'Copy Email';
            const selection = await vscode.window.showInformationMessage(
                `Email alias has been refreshed! New email: ${newEmail}`,
                copyAction
            );

            if (selection === copyAction) {
                await vscode.env.clipboard.writeText(newEmail);
                vscode.window.showInformationMessage('Email copied to clipboard!');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing email: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(identifiersCommand, emailCommand);
}

function loadConfig(): Config {
    const config = vscode.workspace.getConfiguration('cursor-refresher');
    const home = homedir();

    return {
        storageJsonPath: join(home, 'Library/Application Support/Cursor/User/globalStorage/storage.json'),
        msDeviceIdPath: join(home, 'Library/Application Support/Microsoft/DeveloperTools/deviceid'),
        addyApiKey: config.get('addyApiKey', ''),
        addyApiUrl: config.get('addyApiUrl', 'https://app.addy.io/api/v1/aliases'),
        aliasDescription: config.get('aliasDescription', 'cursor'),
        aliasDomain: config.get('aliasDomain', 'anonaddy.me'),
        aliasFormat: config.get('aliasFormat', 'uuid'),
        recipientIds: config.get('recipientIds', [])
    };
}

function generateHexId(length: number = 64): string {
    const hex = '0123456789abcdef';
    return Array.from({ length }, () => hex[Math.floor(Math.random() * hex.length)]).join('');
}

function refreshMsDeviceId(config: Config): string {
    const newDeviceId = randomUUID();
    const path = config.msDeviceIdPath;

    if (existsSync(path)) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, newDeviceId);
    }

    return newDeviceId;
}

async function refreshStorageIds(config: Config): Promise<void> {
    const path = config.storageJsonPath;
    if (!existsSync(path)) {
        throw new Error(`Storage file not found: ${path}`);
    }

    const data = JSON.parse(readFileSync(path, 'utf8'));
    const requiredFields = [
        "telemetry.macMachineId",
        "telemetry.machineId",
        "telemetry.devDeviceId"
    ];

    if (!requiredFields.every(field => field in data)) {
        throw new Error('Missing required fields in storage.json');
    }

    data["telemetry.macMachineId"] = generateHexId();
    data["telemetry.machineId"] = generateHexId();
    data["telemetry.devDeviceId"] = refreshMsDeviceId(config);

    writeFileSync(path, JSON.stringify(data, null, 4));
}

async function refreshAddyAliases(config: Config): Promise<string> {
    const headers = {
        Authorization: `Bearer ${config.addyApiKey}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };

    // Delete existing aliases
    const response = await axios.get(config.addyApiUrl, {
        headers,
        params: {
            'filter[search]': config.aliasDescription,
            'page[size]': 100
        }
    });

    const aliases = response.data.data.filter((alias: any) => 
        alias.description?.startsWith(config.aliasDescription)
    );

    for (const alias of aliases) {
        await axios.delete(`${config.addyApiUrl}/${alias.id}`, { headers });
    }

    // Create new alias
    const payload = {
        domain: config.aliasDomain,
        description: config.aliasDescription,
        format: config.aliasFormat,
        ...(config.recipientIds.length && { recipient_ids: config.recipientIds })
    };

    const createResponse = await axios.post(config.addyApiUrl, payload, { headers });
    const newAlias = createResponse.data.data.email || '';
    return newAlias;
}

async function refreshCursorIdentifiers(config: Config): Promise<void> {
    // Kill Cursor process
    try {
        execSync('pkill -9 Cursor');
    } catch (error) {
        // Ignore if process not found
    }

    await refreshStorageIds(config);
}

export function deactivate() {}