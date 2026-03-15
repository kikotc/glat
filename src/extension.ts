// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as supabase from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as moorcheh from './moorcheh';

export type ChangeCard = {
	id: string;
	author: string;
	created_at: string;
	changed_files: string[];
	impacted_files: string[];
	summary: string;
	raw_diff: string | null;
};

class GlaTChangeCardsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'glat.changeCardsView';

	private _view?: vscode.WebviewView;
	private _changeCards: ChangeCard[] = [];
	private _subscription?: { unsubscribe: () => void };

	constructor(private readonly _extensionUri: vscode.Uri) {}

	async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.onDidReceiveMessage(async (msg) => {
			if (!msg) {
				return;
			}
			if (msg.type === 'command' && typeof msg.command === 'string') {
				await vscode.commands.executeCommand(msg.command);
				return;
			}
			if (msg.type === 'prepareContext' && typeof msg.prompt === 'string') {
				await vscode.commands.executeCommand('glat.prepareContext', msg.prompt);
				return;
			}
			if (msg.type === 'refresh') {
				await this.updateView();
				return;
			}
			if (msg.type === 'clear') {
				await vscode.commands.executeCommand('glat.clearContext');
				return;
			}
		});

		webviewView.onDidDispose(() => {
			if (this._subscription) {
				this._subscription.unsubscribe();
			}
		});

		await this.updateView();

		this._subscription = supabase.subscribeToChanges(() => {
			this.updateView();
		});
	}

	public async updateView(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			this._changeCards = await supabase.getRecentChangeCards();
		} catch (e) {
			this._changeCards = [];
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error(e);
			vscode.window.showErrorMessage(`GLAT: Failed to fetch change cards. ${errorMessage}`);
		}

		this._view.webview.html = this._getHtml(this._view.webview);
		this._view.webview.postMessage({ type: 'refreshComplete' });
	}

	private _getHtml(webview: vscode.Webview): string {
		const cards = this._changeCards
			.map((c) => {
				const changed = c.changed_files.slice(0, 5).map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('');
				const more = c.changed_files.length > 5 ? `<li>…and ${c.changed_files.length - 5} more</li>` : '';

				return `
					<section class="card">
						<header>
							<div class="title">${escapeHtml(c.summary)}</div>
							<div class="meta">${escapeHtml(c.author)} • ${new Date(c.created_at).toLocaleString()}</div>
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
			padding: 0;
			margin: 0;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			box-sizing: border-box;
			height: 100vh;
			overflow: hidden;
		}
		*, *::before, *::after { box-sizing: inherit; }

		.shell {
			display: flex;
			flex-direction: column;
			height: 100vh;
			min-width: var(--minWidth);
		}

		.header {
			padding: var(--pad);
			padding-bottom: 0;
		}

		h1 {
			margin: 0 0 10px;
			font-size: 14px;
			opacity: 0.9;
			letter-spacing: 0.2px;
		}
		.toolbar {
			display: flex;
			gap: 8px;
			margin-bottom: 10px;
			flex-wrap: wrap;
			align-items: center;
		}

		.main {
			flex: 1;
			overflow: auto;
			padding: var(--pad);
			padding-top: 8px;
		}

		.composer {
			padding: var(--pad);
			border-top: 1px solid var(--border);
			background: color-mix(in srgb, var(--vscode-editor-background) 96%, transparent);
		}
		.promptRow {
			display: flex;
			gap: 8px;
			align-items: flex-end;
		}

		textarea {
			flex: 1;
			min-width: 0;
			padding: 7px 10px;
			border-radius: 8px;
			border: 1px solid var(--border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			outline: none;
			resize: none;
			overflow-y: auto;
			overflow-x: hidden;
			white-space: pre-wrap;
			word-break: break-word;
			line-height: 1.35;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		textarea:focus {
			border-color: var(--vscode-focusBorder);
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
		button:hover { filter: brightness(0.92); }
		button:active { filter: brightness(0.86); transform: translateY(0.5px); }
		button.secondary { background: transparent; color: var(--vscode-foreground); }
		button.secondary:hover { background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent); }
		button.secondary:active { background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent); }

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
		.note {
			font-size: 11px;
			opacity: 0.65;
		}
	</style>
</head>
<body>
	<div class="shell">
		<div class="header">
			<h1>GLAT • Change Cards</h1>
			<div class="toolbar">
				<button class="secondary" id="refresh" title="Fetch latest cards from Supabase">Refresh</button>
				<button class="secondary" id="broadcast" title="Manually push your uncommitted changes to the database">Force Sync</button>
				<button class="secondary" id="clear" title="Delete all your broadcasted cards">Clear Mine</button>
				<span class="note">(Auto-syncs on save)</span>
			</div>
		</div>

		<div class="main">
			${this._changeCards.length ? cards : empty}
		</div>

		<div class="composer">
			<div class="promptRow">
				<textarea id="prompt" rows="2" placeholder="Ask Copilot… (GLAT will add teammate context)"></textarea>
				<button class="send" id="send">Enter</button>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi?.();

		const promptEl = document.getElementById('prompt');
		const sendBtn = document.getElementById('send');

		function autoSize() {
			promptEl.style.height = 'auto';
			promptEl.style.height = Math.min(promptEl.scrollHeight, 140) + 'px';
		}

		function sendPrompt() {
			const prompt = (promptEl.value || '').trim();
			if (!prompt) return;
			vscode?.postMessage({ type: 'prepareContext', prompt });
		}

		document.getElementById('broadcast').addEventListener('click', () => {
			vscode?.postMessage({ type: 'command', command: 'glat.broadcastChanges' });
		});
		document.getElementById('refresh').addEventListener('click', () => {
			document.getElementById('refresh').textContent = '...';
			vscode?.postMessage({ type: 'refresh' });
		});
		document.getElementById('clear').addEventListener('click', () => {
			if (confirm('Are you sure you want to delete all your broadcasted context?')) {
				vscode?.postMessage({ type: 'clear' });
			}
		});

		window.addEventListener('message', (event) => {
			if (event.data.type === 'refreshComplete') {
				const btn = document.getElementById('refresh');
				if (btn) btn.textContent = 'Refresh';
			}
		});

		sendBtn.addEventListener('click', sendPrompt);
		promptEl.addEventListener('input', autoSize);
		autoSize();

		promptEl.addEventListener('keydown', (e) => {
			// Enter submits; Shift+Enter inserts a newline
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendPrompt();
			}
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

function parseGitNameOnlyOutput(stdout: string): string[] {
	return stdout
			.trim()
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
}

function fenceCode(languageId: string | undefined, content: string): string {
	const lang = languageId && languageId !== 'plaintext' ? languageId : '';
	return `\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
}

async function generateSmartCardData(rawDiff: string, changedFiles: string[]): Promise<{ summary: string; impacted_files: string[] }> {
	const apiKey = vscode.workspace.getConfiguration('glat').get<string>('geminiApiKey');
	if (!apiKey) {
		console.warn('GEMINI_API_KEY not found. Falling back to generic summary.');
		return {
			summary: `Local code changes detected (${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'})`,
			impacted_files: changedFiles
		};
	}

	try {
		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({
			model: 'gemini-2.5-flash',
			generationConfig: { responseMimeType: 'application/json' }
		});

		const prompt = `You are an expert developer assistant. Analyze the given git diff and provide a concise, 1-2 sentence human-readable summary of the changes. Also, predict an array of other files in the project that might be impacted by this change (e.g., if a function signature changes, where might it be called?). Output JSON with exactly two keys: "summary" (string) and "impacted_files" (array of strings, always including the originally changed files).

Changed Files:
${changedFiles.join('\n')}

Git Diff:
${rawDiff}`;

		const result = await model.generateContent(prompt);
		const parsed = JSON.parse(result.response.text());
		return { summary: parsed.summary || 'Local changes detected', impacted_files: parsed.impacted_files || changedFiles };
	} catch (error) {
		console.error('Failed to generate smart summary with Gemini:', error);
		return { summary: 'Local code changes detected (fallback)', impacted_files: changedFiles };
	}
}

export function activate(context: vscode.ExtensionContext) {
	const viewProvider = new GlaTChangeCardsViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(GlaTChangeCardsViewProvider.viewType, viewProvider)
	);

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (document.uri.scheme !== 'file') return;
			if (saveTimeout) clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				vscode.commands.executeCommand('glat.broadcastChanges', true); // true = isAuto
			}, 10000); // 10-second debounce for background autosaves
		})
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

		vscode.commands.registerCommand('glat.broadcastChanges', async (isAuto: boolean = false) => {
			const workspaceRoot = getWorkspaceRoot();
			if (!workspaceRoot) {
				if (!isAuto) vscode.window.showErrorMessage('GLAT: No workspace folder found. Open a folder/workspace first.');
				return;
			}

			let stdout: string;
			try {
				({ stdout } = await execInWorkspace('git diff --name-only', workspaceRoot));
			} catch (e) {
				if (!isAuto) vscode.window.showErrorMessage(`GLAT: Failed to read git diff. ${e instanceof Error ? e.message : String(e)}`);
				return;
			}

			const changedFiles = parseGitNameOnlyOutput(stdout);
			if (changedFiles.length === 0) {
				if (!isAuto) vscode.window.showInformationMessage('GLAT: No local changes detected (git diff was empty).');
				return;
			}

			const { stdout: rawDiff } = await execInWorkspace('git diff', workspaceRoot);

			const author = await getGitAuthorName(workspaceRoot);
			
			await vscode.window.withProgress({
				location: isAuto ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
				title: "GLAT: Analyzing and broadcasting changes...",
				cancellable: false
			}, async () => {
				const smartData = await generateSmartCardData(rawDiff, changedFiles);
	
				const card: ChangeCard = {
					id: randomUUID(),
					author,
					created_at: new Date().toISOString(),
					changed_files: changedFiles,
					impacted_files: smartData.impacted_files,
					summary: smartData.summary,
					raw_diff: rawDiff
				};
	
				try {
					await supabase.insertChangeCard(card);
					
					// Upload the summary to Moorcheh's semantic memory
					try {
						await moorcheh.uploadSummary(card);
					} catch (moorchehError) {
						console.error('Failed to upload to Moorcheh:', moorchehError);
					}

					// Automatically stage the files so the next `git diff` is purely incremental!
					const filesToStage = changedFiles.map(f => `"${f}"`).join(' ');
					await execInWorkspace(`git add ${filesToStage}`, workspaceRoot);

					await viewProvider.updateView();
					if (!isAuto) vscode.window.showInformationMessage(`GLAT: Broadcasted and staged ${changedFiles.length} file(s).`);
				} catch (e) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					if (!isAuto) vscode.window.showErrorMessage(`GLAT: Failed to broadcast change card. ${errorMessage}`);
				}
			});
		}),

		vscode.commands.registerCommand('glat.prepareContext', async (providedPrompt?: string) => {
			const userPrompt =
				typeof providedPrompt === 'string' && providedPrompt.trim().length > 0
					? providedPrompt.trim()
					: await vscode.window.showInputBox({
							prompt: 'What do you want Copilot to do?',
							placeHolder: 'e.g., Refactor this function to be more readable'
						});
			if (!userPrompt) {
				return;
			}

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "GLAT: Finding relevant context...",
				cancellable: false
			}, async () => {
				const editor = vscode.window.activeTextEditor;
				const activeAbsPath = editor?.document.fileName;
				const activeRelPath = activeAbsPath ? toWorkspaceRelativePath(activeAbsPath) : undefined;
				const fileContents = editor?.document.getText();

				const relevantCardsMap = new Map<string, ChangeCard>();

				// 1. Ask Moorcheh for the most relevant teammate changes based on the prompt
				try {
					const relevantCardIds = await moorcheh.searchRelevantCards(userPrompt);
					const moorchehCards = await supabase.getCardsByIds(relevantCardIds);
					for (const card of moorchehCards) {
						relevantCardsMap.set(card.id, card);
					}
				} catch (e) {
					console.error('Moorcheh search failed:', e);
				}

				// 2. Always include context for the file the user currently has open
				if (activeRelPath) {
					try {
						const activeFileCards = await supabase.getCardsForFile(activeRelPath);
						for (const card of activeFileCards) {
							relevantCardsMap.set(card.id, card);
						}
					} catch (e) {
						console.error(`Failed to fetch cards for active file:`, e);
					}
				}

				const relevant = Array.from(relevantCardsMap.values());

				const teammateChanges = relevant.length
					? relevant.map((c) => {
							let text = `- **${c.author}** (${new Date(c.created_at).toLocaleString()}): ${c.summary}`;
							if (c.raw_diff) {
								text += `\n\`\`\`diff\n${c.raw_diff}\n\`\`\``;
							}
							return text;
					  }).join('\n\n')
					: '- (none)';

				let prompt = `# GLAT Context Packet\n\n## Task\n${userPrompt}\n\n## Relevant teammate changes\n${teammateChanges}`;

				if (activeRelPath && fileContents) {
					prompt += `\n\n## Current file\n**${activeRelPath}**${fenceCode(editor?.document.languageId, fileContents)}`;
				} else {
					prompt += `\n\n*(No active file provided)*`;
				}

				await vscode.env.clipboard.writeText(prompt);
				const doc = await vscode.workspace.openTextDocument({ content: prompt, language: 'markdown' });
				await vscode.window.showTextDocument(doc, { preview: false });
				vscode.window.showInformationMessage('GLAT: Context packet copied to clipboard. Paste it into Copilot Chat.');
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('glat.clearContext', async () => {
			const workspaceRoot = getWorkspaceRoot();
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('GLAT: No workspace folder found.');
				return;
			}

			const author = await getGitAuthorName(workspaceRoot);
			try {
				await supabase.deleteUserCards(author);
				await viewProvider.updateView();
				vscode.window.showInformationMessage(`GLAT: Cleared all change cards for ${author}.`);
			} catch (e) {
				vscode.window.showErrorMessage(`GLAT: Failed to clear context. ${e instanceof Error ? e.message : String(e)}`);
			}
		})
	);
}

export function deactivate() {}
