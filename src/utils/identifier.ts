import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { ExtensionConfig } from './config';

interface StorageData {
  'telemetry.macMachineId': string;
  'telemetry.machineId': string;
  'telemetry.devDeviceId': string;
  'telemetry.sqmId': string;
  [key: string]: string;
}

export class SystemIdentifierManager {
  private static readonly HEX_CHARS = '0123456789abcdef';

  constructor(private readonly config: ExtensionConfig) { }

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