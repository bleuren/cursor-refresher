import * as vscode from 'vscode';
import { homedir } from 'os';
import { join } from 'path';

export class ExtensionConfig {
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

  constructor(private readonly config: vscode.WorkspaceConfiguration) { }

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