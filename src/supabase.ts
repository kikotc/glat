import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as vscode from 'vscode';
import type { ChangeCard } from './extension';

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
	if (supabase) {
		return supabase;
	}

	const config = vscode.workspace.getConfiguration('glat');
	const supabaseUrl = config.get<string>('supabaseUrl');
	const supabaseKey = config.get<string>('supabaseAnonKey');

	if (!supabaseUrl || !supabaseKey) {
		throw new Error('Supabase URL or anonymous key not set. Configure them in VS Code Settings under GLAT.');
	}

	supabase = createClient(supabaseUrl, supabaseKey);
	return supabase;
}

export async function insertChangeCard(card: ChangeCard): Promise<void> {
	const client = getSupabaseClient();

	const { error: cardError } = await client.from('change_cards').insert(card);

	if (cardError) {
		console.error('Error inserting change card:', cardError);
		throw new Error(`Failed to insert change card: ${cardError.message}`);
	}

	const links = card.impacted_files.map((file) => ({
		file_path: file,
		card_id: card.id
	}));

	if (links.length > 0) {
		const { error: indexError } = await client.from('file_card_index').insert(links);

		if (indexError) {
			console.error('Error inserting into file_card_index:', indexError);
			// In a real app, we might want to handle this more gracefully (e.g., by trying to delete the card).
			throw new Error(`Failed to index change card files: ${indexError.message}`);
		}
	}
}

export async function getCardsForFile(filePath: string): Promise<ChangeCard[]> {
	const client = getSupabaseClient();

	const { data: indexData, error: indexError } = await client
		.from('file_card_index')
		.select('card_id')
		.eq('file_path', filePath);

	if (indexError) {
		console.error('Error fetching from file_card_index:', indexError);
		return [];
	}
	if (!indexData || indexData.length === 0) {
		return [];
	}

	const cardIds = indexData.map((item) => item.card_id);

	const { data: cardsData, error: cardsError } = await client.from('change_cards').select('*').in('id', cardIds);

	if (cardsError) {
		console.error('Error fetching change cards:', cardsError);
		return [];
	}

	return (cardsData as ChangeCard[]) || [];
}

export async function getRecentChangeCards(limit = 50): Promise<ChangeCard[]> {
	const client = getSupabaseClient();
	const { data, error } = await client.from('change_cards').select('*').order('created_at', { ascending: false }).limit(limit);

	if (error) {
		console.error('Error fetching recent change cards:', error);
		return [];
	}

	return (data as ChangeCard[]) || [];
}

export async function getCardsByIds(cardIds: string[]): Promise<ChangeCard[]> {
	if (cardIds.length === 0) return [];
	const client = getSupabaseClient();
	const { data, error } = await client.from('change_cards').select('*').in('id', cardIds);

	if (error) {
		console.error('Error fetching change cards by IDs:', error);
		return [];
	}

	return (data as ChangeCard[]) || [];
}

export async function deleteUserCards(author: string): Promise<void> {
	const client = getSupabaseClient();
	const { error } = await client.from('change_cards').delete().eq('author', author);
	
	if (error) {
		console.error('Error deleting user cards:', error);
		throw new Error(`Failed to clear context: ${error.message}`);
	}
}

export function subscribeToChanges(callback: () => void): { unsubscribe: () => void } {
	const client = getSupabaseClient();
	const channel = client.channel('change_cards_changes')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'change_cards' }, () => {
			callback();
		})
		.subscribe();

	return { unsubscribe: () => { client.removeChannel(channel); } };
}