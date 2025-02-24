import * as vscode from 'vscode';
import { ExtensionConfig } from './utils/config';
import { EmailAliasManager } from './utils/addyio';
import { SystemIdentifierManager } from './utils/identifier';

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

export function deactivate() { }