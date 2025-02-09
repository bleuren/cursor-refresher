import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import axios from 'axios';
import { randomUUID } from 'crypto';

interface StorageData {
    'telemetry.macMachineId': string;
    'telemetry.machineId': string;
    'telemetry.devDeviceId': string;
    'telemetry.sqmId': string;
    [key: string]: string;
}

interface AddyAlias {
    id: string;
    email: string;
    description?: string;
    [key: string]: unknown;
}

class ExtensionConfig {
    private static readonly SYSTEM_PATHS = {
        storage: 'Library/Application Support/Cursor/User/globalStorage/storage.json',
        deviceId: 'Library/Application Support/Microsoft/DeveloperTools/deviceid',
        mainJs: '/Applications/Cursor.app/Contents/Resources/app/out/main.js',
        platformUuid: '/var/root/Library/Preferences/SystemConfiguration/com.apple.platform.uuid.plist'
    };

    private static readonly API_DEFAULTS = {
        url: 'https://app.addy.io/api/v1/aliases',
        domain: 'anonaddy.me',
        format: 'uuid',
        description: 'cursor'
    };

    constructor(private readonly config: vscode.WorkspaceConfiguration) {}

    get paths() {
        const home = homedir();
        return {
            storage: join(home, ExtensionConfig.SYSTEM_PATHS.storage),
            deviceId: join(home, ExtensionConfig.SYSTEM_PATHS.deviceId),
            mainJs: ExtensionConfig.SYSTEM_PATHS.mainJs,
            platformUuid: ExtensionConfig.SYSTEM_PATHS.platformUuid
        };
    }

    get addyConfig() {
        return {
            apiKey: this.config.get<string>('addyApiKey', ''),
            apiUrl: this.config.get<string>('addyApiUrl', ExtensionConfig.API_DEFAULTS.url),
            description: this.config.get<string>('aliasDescription', ExtensionConfig.API_DEFAULTS.description),
            domain: this.config.get<string>('aliasDomain', ExtensionConfig.API_DEFAULTS.domain),
            format: this.config.get<string>('aliasFormat', ExtensionConfig.API_DEFAULTS.format),
            recipientIds: this.config.get<string[]>('recipientIds', [])
        };
    }
}

class SystemIdentifierManager {
    private static readonly HEX_CHARS = '0123456789abcdef';

    constructor(private readonly config: ExtensionConfig) {}

    private static generateHexId(length: number = 64): string {
        return Array.from(
            { length }, 
            () => this.HEX_CHARS[Math.floor(Math.random() * this.HEX_CHARS.length)]
        ).join('');
    }

    async refresh(): Promise<void> {
        await this.killCursorProcess();
        await this.modifyMainJs();
        await this.refreshIdentifiers();
    }

    private async killCursorProcess(): Promise<void> {
        try {
            execSync('pkill -9 Cursor');
        } catch {
            // Ignore if process not found
        }
    }

    private async modifyMainJs(): Promise<void> {
        const mainJsPath = this.config.paths.mainJs;
        try {
            const content = readFileSync(mainJsPath, 'utf8');
            const updatedContent = this.updateMainJsContent(content);
            writeFileSync(mainJsPath, updatedContent);
        } catch (error) {
            throw new Error(`Failed to modify main.js: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private updateMainJsContent(content: string): string {
        const patterns = {
            getMachineId: /async getMachineId\(\)\{return [^??]+\?\?([^}]+)\}/,
            getMacMachineId: /async getMacMachineId\(\)\{return [^??]+\?\?([^}]+)\}/
        };

        let modifiedContent = content;
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = content.match(pattern);
            if (match) {
                const replacement = `async ${key}(){return ${match[1]}}`;
                modifiedContent = modifiedContent.replace(pattern, replacement);
            }
        }
        return modifiedContent;
    }

    private async refreshIdentifiers(): Promise<void> {
        const storage = this.readStorageFile();
        const { newIds, macMachineId } = this.generateNewIdentifiers();
        
        Object.assign(storage, newIds);
        await this.updatePlatformUuid(macMachineId);
        
        writeFileSync(this.config.paths.storage, JSON.stringify(storage, null, 4));
    }

    private readStorageFile(): StorageData {
        const path = this.config.paths.storage;
        if (!existsSync(path)) {
            throw new Error(`Storage file not found: ${path}`);
        }

        const data = JSON.parse(readFileSync(path, 'utf8')) as StorageData;
        const requiredFields = [
            'telemetry.macMachineId',
            'telemetry.machineId',
            'telemetry.devDeviceId',
            'telemetry.sqmId'
        ];

        if (!requiredFields.every(field => field in data)) {
            throw new Error('Missing required fields in storage.json');
        }

        return data;
    }

    private generateNewIdentifiers() {
        const newDeviceId = this.refreshDeviceId();
        const macMachineId = SystemIdentifierManager.generateHexId(128);

        return {
            newIds: {
                'telemetry.macMachineId': macMachineId,
                'telemetry.machineId': SystemIdentifierManager.generateHexId(64),
                'telemetry.devDeviceId': newDeviceId,
                'telemetry.sqmId': `{${randomUUID().toUpperCase()}}`
            },
            macMachineId
        };
    }

    private refreshDeviceId(): string {
        const newDeviceId = randomUUID();
        const path = this.config.paths.deviceId;

        if (existsSync(path)) {
            writeFileSync(path, newDeviceId);
        }

        return newDeviceId;
    }

    private async updatePlatformUuid(macMachineId: string): Promise<void> {
        const uuidFile = this.config.paths.platformUuid;
        try {
            if (existsSync(uuidFile)) {
                const cmd = `sudo plutil -replace "UUID" -string "${macMachineId}" "${uuidFile}"`;
                execSync(cmd);
            }
        } catch (error) {
            throw new Error(`Failed to update macOS Platform UUID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

class EmailAliasManager {
    constructor(private readonly config: ExtensionConfig) {}

    async refresh(): Promise<string> {
        if (!this.config.addyConfig.apiKey) {
            throw new Error('Addy.io API key is required');
        }

        await this.deleteExistingAliases();
        return this.createNewAlias();
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.config.addyConfig.apiKey}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    private async deleteExistingAliases(): Promise<void> {
        const { apiUrl, description } = this.config.addyConfig;
        const response = await axios.get<{ data: AddyAlias[] }>(apiUrl, {
            headers: this.headers,
            params: {
                'filter[search]': description,
                'page[size]': 100
            }
        });

        const aliases = response.data.data.filter(alias => 
            alias.description?.startsWith(description)
        );

        await Promise.all(
            aliases.map(alias => 
                axios.delete(`${apiUrl}/${alias.id}`, { headers: this.headers })
            )
        );
    }

    private async createNewAlias(): Promise<string> {
        const { apiUrl, domain, description, format, recipientIds } = this.config.addyConfig;
        const payload = {
            domain,
            description,
            format,
            ...(recipientIds.length && { recipient_ids: recipientIds })
        };

        const response = await axios.post(apiUrl, payload, { headers: this.headers });
        return response.data.data.email || '';
    }
}

export function activate(context: vscode.ExtensionContext) {
    const config = new ExtensionConfig(vscode.workspace.getConfiguration('cursor-refresher'));
    const systemManager = new SystemIdentifierManager(config);
    const emailManager = new EmailAliasManager(config);

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-refresher.refreshIdentifiers', async () => {
            try {
                await systemManager.refresh();
                vscode.window.showInformationMessage('Cursor identifiers have been refreshed successfully!');
            } catch (error) {
                vscode.window.showErrorMessage(`Error refreshing Cursor identifiers: ${error instanceof Error ? error.message : String(error)}`);
            }
        }),

        vscode.commands.registerCommand('cursor-refresher.refreshEmail', async () => {
            try {
                const newEmail = await emailManager.refresh();
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
        })
    );
}

export function deactivate() {}