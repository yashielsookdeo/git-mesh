import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { GitMeshWebviewProvider } from './webviewProvider';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('GitMesh');
  outputChannel.appendLine('GitMesh extension activated');

  const webviewProvider = new GitMeshWebviewProvider(context.extensionUri, outputChannel, context);

  registerCommands(context, webviewProvider, outputChannel);

  outputChannel.appendLine('GitMesh commands registered');
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}
