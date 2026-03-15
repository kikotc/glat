import * as vscode from 'vscode';

const NAMESPACE = 'glat-cards';
const BASE_URL = 'https://api.moorcheh.ai/v1';

function getApiKey(): string {
	const key = vscode.workspace.getConfiguration('glat').get<string>('moorchehApiKey');
	if (!key) {
		throw new Error('Moorcheh API Key not set. Configure it in VS Code Settings under GLAT.');
	}
	return key;
}

export async function uploadSummary(summary: string, cardId: string): Promise<void> {
	const apiKey = getApiKey();

	const payload = {
		documents: [
			{
				id: cardId,
				text: summary
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
		top_k: 5
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