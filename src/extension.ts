// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'node:child_process';

type ChangeCard = {
	author: string;
	timestamp: string;
	changedFiles: string[];
	impactedFiles: string[];
	summary: string;
};

const changeCards: ChangeCard[] = [];

class GlaTChangeCardsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'glat.changeCardsView';

	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.onDidReceiveMessage(async (msg) => {
			if (msg?.type === 'command' && typeof msg.command === 'string') {
				await vscode.commands.executeCommand(msg.command);
			}
		});

		webviewView.webview.html = this._getHtml(webviewView.webview);
	}

	public refresh(): void {
		if (!this._view) {
			return;
		}
		this._view.webview.html = this._getHtml(this._view.webview);
	}

	private _getHtml(webview: vscode.Webview): string {
		const cards = changeCards
			.slice()
			.reverse()
			.map((c) => {
				const changed = c.changedFiles.slice(0, 5).map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('');
				const more = c.changedFiles.length > 5 ? `<li>…and ${c.changedFiles.length - 5} more</li>` : '';

				return `
					<section class="card">
						<header>
							<div class="title">${escapeHtml(c.summary)}</div>
							<div class="meta">${escapeHtml(c.author)} • ${new Date(c.timestamp).toLocaleString()}</div>
						</header>
						<div class="body">
							<div class="label">Changed files</div>
							<ul class="files">${changed}${more}</ul>
						</div>
					</section>
				`;
			})
			.join('\n');

		const empty = `
			<div class="empty">
				<div class="emptyTitle">No change cards yet</div>
				<div class="emptySub">Use <b>GLAT: Broadcast Local Changes</b> to create one.</div>
			</div>
		`;

		return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>GLAT</title>
	<style>
		:root {
			--pad: 12px;
			--radius: 10px;
			--border: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
			--minWidth: 280px;
		}
		/* Note: VS Code controls the actual view width; we can only ensure our layout
		   doesn't collapse/overflow badly below a minimum. */
		body {
			min-width: var(--minWidth);
			padding: var(--pad);
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			box-sizing: border-box;
		}
		*, *::before, *::after { box-sizing: inherit; }
		h1 {
			margin: 0 0 10px;
			font-size: 14px;
			opacity: 0.9;
			letter-spacing: 0.2px;
		}
		.toolbar {
			display: flex;
			gap: 8px;
			margin-bottom: 12px;
			flex-wrap: wrap;
		}
		button {
			appearance: none;
			border: 1px solid var(--border);
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			padding: 6px 10px;
			border-radius: 8px;
			cursor: pointer;
			font-weight: 600;
			max-width: 100%;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			transition: filter 120ms ease, transform 60ms ease;
		}
		button:hover {
			filter: brightness(0.92);
		}
		button:active {
			filter: brightness(0.86);
			transform: translateY(0.5px);
		}
		button.secondary {
			background: transparent;
			color: var(--vscode-foreground);
		}
		button.secondary:hover {
			background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
		}
		button.secondary:active {
			background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
		}
		.empty {
			padding: 18px 12px;
			border: 1px dashed var(--border);
			border-radius: var(--radius);
			opacity: 0.9;
		}
		.emptyTitle { font-weight: 700; margin-bottom: 4px; }
		.emptySub { opacity: 0.85; }
		.card {
			border: 1px solid var(--border);
			border-radius: var(--radius);
			padding: 12px;
			margin-bottom: 10px;
			background: color-mix(in srgb, var(--vscode-editor-background) 92%, transparent);
		}
		.card header { margin-bottom: 10px; }
		.title { font-weight: 800; line-height: 1.2; }
		.meta { opacity: 0.75; font-size: 12px; margin-top: 3px; }
		.label { opacity: 0.8; font-size: 12px; margin-bottom: 6px; }
		.files { margin: 0; padding-left: 18px; }
		.files li { margin: 2px 0; opacity: 0.95; }
		code { font-family: var(--vscode-editor-font-family); font-size: 12px; }
	</style>
</head>
<body>
	<h1>GLAT • Change Cards</h1>
	<div class="toolbar">
		<button id="broadcast">Broadcast</button>
		<button class="secondary" id="prepare">Prepare Context</button>
	</div>
	${changeCards.length ? cards : empty}

	<script>
		const vscode = acquireVsCodeApi?.();
		document.getElementById('broadcast').addEventListener('click', () => {
			vscode?.postMessage({ type: 'command', command: 'glat.broadcastChanges' });
		});
		document.getElementById('prepare').addEventListener('click', () => {
			vscode?.postMessage({ type: 'command', command: 'glat.prepareContext' });
		});
	</script>
</body>
</html>`;
	}
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function getWorkspaceRoot(): string | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.fsPath;
}

function execInWorkspace(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		exec(command, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(stderr?.toString() || err.message));
				return;
			}
			resolve({ stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '' });
		});
	});
}

async function getGitAuthorName(workspaceRoot: string): Promise<string> {
	try {
		const { stdout } = await execInWorkspace('git config user.name', workspaceRoot);
		const name = stdout.trim();
		return name || 'developer';
	} catch {
		return 'developer';
	}
}

function toWorkspaceRelativePath(absPath: string): string {
	return vscode.workspace.asRelativePath(absPath, false);
}

function fenceCode(languageId: string | undefined, content: string): string {
	const lang = languageId && languageId !== 'plaintext' ? languageId : '';
	return `\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
}

export function activate(context: vscode.ExtensionContext) {
	const viewProvider = new GlaTChangeCardsViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(GlaTChangeCardsViewProvider.viewType, viewProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('glat.openPanel', async () => {
			const panel = vscode.window.createWebviewPanel('glat.panel', 'GLAT', vscode.ViewColumn.One, { enableScripts: true });
			panel.webview.html = `<!doctype html>
			<html><body style="padding:12px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)">
				<h2 style="margin:0 0 8px">GLAT</h2>
				<p style="margin:0;opacity:.85">UI preview panel. Use the Activity Bar <b>GLAT</b> icon to see Change Cards.</p>
			</body></html>`;
		}),

		vscode.commands.registerCommand('glat.broadcastChanges', async () => {
			const workspaceRoot = getWorkspaceRoot();
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('GLAT: No workspace folder found. Open a folder/workspace first.');
				return;
			}

			let stdout: string;
			try {
				({ stdout } = await execInWorkspace('git diff --name-only', workspaceRoot));
			} catch (e) {
				vscode.window.showErrorMessage(`GLAT: Failed to read git diff. ${e instanceof Error ? e.message : String(e)}`);
				return;
			}

			const changedFiles = stdout
				.trim()
				.split(/\r?\n/)
				.map((s) => s.trim())
				.filter(Boolean);

			if (changedFiles.length === 0) {
				vscode.window.showInformationMessage('GLAT: No local changes detected (git diff was empty).');
				return;
			}

			const author = await getGitAuthorName(workspaceRoot);
			const card: ChangeCard = {
				author,
				timestamp: new Date().toISOString(),
				changedFiles,
				impactedFiles: changedFiles,
				summary: `Local code changes detected (${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'})`
			};

			changeCards.push(card);
			viewProvider.refresh();
			vscode.window.showInformationMessage(`GLAT: Broadcasted change card with ${changedFiles.length} file(s).`);
		}),

		vscode.commands.registerCommand('glat.prepareContext', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('GLAT: No active editor. Open a file first.');
				return;
			}

			const userPrompt = await vscode.window.showInputBox({
				prompt: 'What do you want Copilot to do?',
				placeHolder: 'e.g., Refactor this function to be more readable'
			});
			if (!userPrompt) {
				return;
			}

			const activeAbsPath = editor.document.fileName;
			const activeRelPath = toWorkspaceRelativePath(activeAbsPath);
			const fileContents = editor.document.getText();

			const relevant = changeCards.filter((c) => c.impactedFiles.includes(activeRelPath));
			const teammateChanges = relevant.length
				? relevant
						.map((c) => `- **${c.author}** (${new Date(c.timestamp).toLocaleString()}): ${c.summary}`)
						.join('\n')
				: '- (none)';

			const prompt = `# GLAT Context Packet\n\n## Task\n${userPrompt}\n\n## Relevant teammate changes\n${teammateChanges}\n\n## Current file\n**${activeRelPath}**${fenceCode(editor.document.languageId, fileContents)}`;

			const doc = await vscode.workspace.openTextDocument({ content: prompt, language: 'markdown' });
			await vscode.window.showTextDocument(doc, { preview: false });
		})
	);
}

export function deactivate() {}
