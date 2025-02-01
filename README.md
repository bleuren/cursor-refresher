# VSCode Cursor Refresh Extension

A VSCode extension that helps refresh Cursor editor configuration and manage email aliases.

## Features

- Refresh Cursor machine identifiers
- Manage Addy.io email aliases
- Automatic process termination
- Easy configuration through VSCode settings

## Requirements

- VSCode 1.85.0 or higher
- macOS operating system
- Valid Addy.io API key

## Extension Settings

This extension contributes the following settings:

* `cursor-refresh.addyApiKey`: Addy.io API Key
* `cursor-refresh.addyApiUrl`: Addy.io API URL
* `cursor-refresh.aliasDescription`: Alias description
* `cursor-refresh.aliasDomain`: Alias domain
* `cursor-refresh.aliasFormat`: Alias format
* `cursor-refresh.recipientIds`: Optional recipient IDs

## Usage

1. Install the extension from VSCode marketplace
2. Configure your Addy.io API key in VSCode settings
3. Open command palette (Cmd+Shift+P)
4. Run command "Refresh Cursor Configuration"

## Notes

- Please ensure Cursor is not running when using this extension
- Make sure to back up any important data before refreshting
- This extension only works on macOS

## Disclaimer

This extension is for educational purposes only. Use at your own risk.