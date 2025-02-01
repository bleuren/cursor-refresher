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
    let disposable = vscode.commands.registerCommand('cursor-refresh.refreshCursor', async () => {
        try {
            const config = loadConfig();
            const newEmail = await refreshCursor(config);
            
            // Show message with copy button
            const copyAction = 'Copy Email';
            const selection = await vscode.window.showInformationMessage(
                `Cursor refresh completed successfully! New email: ${newEmail}`,
                copyAction
            );

            if (selection === copyAction) {
                await vscode.env.clipboard.writeText(newEmail);
                vscode.window.showInformationMessage('Email copied to clipboard!');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(disposable);
}

function loadConfig(): Config {
    const config = vscode.workspace.getConfiguration('cursor-refresh');
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

function handleMsDeviceId(config: Config): string {
    const newDeviceId = randomUUID();
    const path = config.msDeviceIdPath;

    if (existsSync(path)) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, newDeviceId);
    }

    return newDeviceId;
}

async function updateStorageIds(config: Config): Promise<void> {
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
    data["telemetry.devDeviceId"] = handleMsDeviceId(config);

    writeFileSync(path, JSON.stringify(data, null, 4));
}

async function manageAddyAliases(config: Config): Promise<string> {
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

async function refreshCursor(config: Config): Promise<string> {
    // Kill Cursor process
    try {
        execSync('pkill -9 Cursor');
    } catch (error) {
        // Ignore if process not found
    }

    if (!config.addyApiKey) {
        throw new Error('Addy.io API key is required');
    }

    await updateStorageIds(config);
    const newEmail = await manageAddyAliases(config);
    return newEmail;
}

export function deactivate() {}