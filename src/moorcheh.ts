import * as vscode from 'vscode';
import type { ChangeCard } from './extension';

const NAMESPACE = 'glat-cards';
const BASE_URL = 'https://api.moorcheh.ai/v1';

function getApiKey(): string {
	const key = vscode.workspace.getConfiguration('glat').get<string>('moorchehApiKey');
	if (!key) {
		throw new Error('Moorcheh API Key not set. Configure it in VS Code Settings under GLAT.');
	}
	return key;
}

export async function uploadSummary(card: ChangeCard): Promise<void> {
	const apiKey = getApiKey();

	const payload = {
		documents: [
			{
				id: card.id,
				text: card.summary,
				author: card.author,
				changed_files: card.changed_files
			}
		]
	};

	const response = await fetch(`${BASE_URL}/namespaces/${NAMESPACE}/documents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Moorcheh upload failed (${response.status}): ${errorText}`);
	}
}

export async function searchRelevantCards(userPrompt: string): Promise<string[]> {
	const apiKey = getApiKey();

	const payload = {
		query: userPrompt,
		namespaces: [NAMESPACE],
		top_k: 5,
		kiosk_mode: true,
		threshold: 0.1
	};

	const response = await fetch(`${BASE_URL}/search`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Moorcheh search failed (${response.status}): ${errorText}`);
	}

	const data = await response.json() as any;
	
	if (data && data.results && Array.isArray(data.results)) {
		return data.results.map((result: any) => result.id);
	}

	return [];
}