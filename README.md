# VSCode Cursor Refresher

A VSCode extension tool for refreshing Cursor editor identifiers and email aliases. This tool provides two main functionalities that can be used independently:
1. Refresh Cursor machine identifiers
2. Refresh Addy.io email aliases

## Features

- **Cursor Identifiers Refreshing**
  - Generate new machine identifiers for Cursor
  - Automatic process termination before refresh
  - Clean refresh of Cursor identifiers

- **Email Alias Refreshing**
  - Generate new Addy.io email aliases
  - Remove old aliases automatically
  - Copy new email to clipboard with one click
  - Full integration with Addy.io API

## Requirements

- VSCode 1.85.0 or higher
- macOS operating system
- Valid Addy.io API key (only required for email alias refresh)

## Extension Settings

This extension contributes the following settings:

* `cursor-refresher.addyApiKey`: Addy.io API Key (required for email alias refresh)
* `cursor-refresher.addyApiUrl`: Addy.io API URL
* `cursor-refresher.aliasDescription`: Alias description
* `cursor-refresher.aliasDomain`: Alias domain
* `cursor-refresher.aliasFormat`: Alias format
* `cursor-refresher.recipientIds`: Optional recipient IDs

## Usage

1. Install the extension from VSCode marketplace
2. Configure your Addy.io API key in VSCode settings (if you plan to use email alias refresh)
3. Open command palette (Cmd+Shift+P)
4. Choose one of the following commands:
   - `Refresh Cursor Identifiers`: Generate new machine identifiers for Cursor
   - `Refresh Email Alias`: Create a new email alias and remove old ones

## Notes

- Please ensure Cursor is not running when refreshing identifiers
- Make sure to back up any important data before refreshing Cursor identifiers
- The identifier refresh functionality only works on macOS
- Email alias refresh requires a valid Addy.io API key

## Privacy

- Machine identifiers are generated locally and never transmitted
- Email aliases are managed through your personal Addy.io account
- No data is collected or shared by this extension

## Disclaimer

This extension is for educational purposes only. Use at your own risk.