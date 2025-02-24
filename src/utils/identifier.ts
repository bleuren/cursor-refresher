import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID, createHash } from 'crypto';
import { ExtensionConfig } from './config';

interface StorageData {
  'telemetry.macMachineId': string;
  'telemetry.machineId': string;
  'telemetry.devDeviceId': string;
  'telemetry.sqmId': string;
  [key: string]: string;
}

export class SystemIdentifierManager {
  constructor(private readonly config: ExtensionConfig) { }

  private static generateDeviceUUID(input: string): string {
    const hash = createHash('md5').update(input).digest('hex');
    return hash.replace(/(.{8})(.{4})(.{3})(.{3})(.{12})/, '$1-$2-3$3-8$4-$5');
  }

  private static generateMachineId(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private static generateMacMachineId(input: string): string {
    return createHash('sha256').update(input + input).digest('hex');
  }

  async refresh(): Promise<void> {
    try {
      await this.killCursorProcess();
      await this.modifyMainJs();
      await this.refreshIdentifiers();
    } catch (error) {
      throw new Error(`Refresh operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const baseId = randomUUID();
    const deviceId = SystemIdentifierManager.generateDeviceUUID(baseId);
    const macMachineId = SystemIdentifierManager.generateMacMachineId(baseId);

    return {
      newIds: {
        'telemetry.macMachineId': macMachineId,
        'telemetry.machineId': SystemIdentifierManager.generateMachineId(baseId),
        'telemetry.devDeviceId': deviceId,
        'telemetry.sqmId': `{${deviceId.toUpperCase()}}`
      },
      macMachineId
    };
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