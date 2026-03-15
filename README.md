# GLAT: Multi-Agent Shared Memory Layer 🧠🤝

GLAT (Global Local Agent Transport) is a VS Code extension that acts as a shared memory and context layer for coding agents (like GitHub Copilot). 

In modern dev teams, multiple developers and agents work in parallel, but they work in isolation. An agent on Developer B's machine has no idea about the uncommitted local changes Developer A is currently making. GLAT bridges this gap by silently syncing local uncommitted changes to a shared semantic memory pool, empowering agents to collaborate across machines before a single commit is ever made.

## ✨ Key Features
* **Autonomous Background Sync:** Automatically detects file saves, extracts the exact `git diff`, and tracks new files without user intervention.
* **AI Summarization:** Uses Google's **Gemini 2.5 Flash** to translate noisy syntax diffs into human-readable logical intents.
* **Enterprise RAG Architecture:** Combines **Moorcheh** (Vector DB for semantic routing) and **Supabase** (Relational DB for syntax/raw code storage) for flawless context retrieval.
* **Native Copilot Handoff:** Injects the augmented context packet directly into the native VS Code Copilot Chat, maintaining Copilot's powerful "Apply in Editor" capabilities.
* **Real-time UI:** Live, automatically refreshing timeline of teammate changes right in your VS Code sidebar using WebSockets.

## 🏗️ Architecture

1. **VS Code Extension (The Client):** Handles UI, file system listening, and Git operations.
2. **Gemini 2.5 Flash (The Intelligence):** Analyzes raw Git diffs, writes human-readable summaries, and predicts impacted files.
3. **Supabase / PostgreSQL (The Source of Truth):** Stores the heavy, structured data (the raw code diffs, author names, timestamps).
4. **Moorcheh (The Semantic Search Engine):** A vector database that stores ONLY the AI-generated summaries. It excels at matching a user's natural language prompt ("How does the new login work?") to the mathematical "meaning" of a summary.

## 🚀 Setup Instructions

### Prerequisites
* Visual Studio Code
* API Keys for: **Moorcheh**, **Supabase**, and **Google AI Studio (Gemini)**

### 1. Database Setup (Supabase)
1. Create a new Supabase project.
2. Run the following SQL to create the required tables:
   ```sql
   CREATE TABLE change_cards (
       id uuid PRIMARY KEY,
       author text NOT NULL,
       created_at timestamptz NOT NULL,
       changed_files jsonb NOT NULL,
       impacted_files jsonb NOT NULL,
       summary text NOT NULL,
       raw_diff text
   );

   CREATE TABLE file_card_index (
       file_path text NOT NULL,
       card_id uuid NOT NULL REFERENCES change_cards(id) ON DELETE CASCADE,
       PRIMARY KEY (file_path, card_id)
   );
   ```
3. Enable **Realtime** for the `change_cards` table in the Supabase Table Editor settings.

### 2. Semantic Search Setup (Moorcheh)
1. Go to your Moorcheh Console.
2. Navigate to the **Namespaces** tab.
3. Create a new namespace named **`glat-cards`** and set its type to **Text Namespace**.

### 3. Installation (Using .vsix)
1. Go to the **Releases** page of this GitHub repository and download the `glat-0.0.2.vsix` file.
2. Open Visual Studio Code and navigate to the **Extensions** view (`Cmd+Shift+X` / `Ctrl+Shift+X`).
3. Click the **`...`** (Views and More Actions) menu in the top right corner of the Extensions panel.
4. Select **Install from VSIX...** and choose the downloaded file.

### 4. Extension Configuration
1. Open your VS Code Settings (`Cmd + ,` or `Ctrl + ,`).
2. Search for `GLAT`.
3. Enter your API credentials in the respective fields:
   * `Glat: Gemini Api Key`
   * `Glat: Moorcheh Api Key`
   * `Glat: Supabase Url`
   * `Glat: Supabase Anon Key`

## 💻 Usage Guide

### Broadcasting Changes (Developer A)
1. Simply write code or have Copilot write code for you.
2. Save the file.
3. **Do nothing else!** After 10 seconds of inactivity, GLAT will automatically read the diff, generate a summary, sync it to Moorcheh/Supabase, and stage the files to prepare for the next delta.
*Note: You can also manually click the "Force Sync" button in the GLAT sidebar.*

### Retrieving Context (Developer B)
1. Open the GLAT sidebar (Activity Bar icon).
2. Type your prompt in the text box (e.g., *"Refactor the weather component"*).
3. Press **Enter**.
4. GLAT will perform a semantic search, retrieve your teammates' uncommitted code, and automatically open your Copilot Chat pre-filled with the exact context and strict instructions. Hit **Send** to let Copilot work its magic!

## 🧹 Cleanup
Finished your feature and pushed to `main`? Click the **"Clear Mine"** button in the GLAT sidebar to safely remove your uncommitted context from the global pool without affecting your teammates' cards.

## 🛠️ Building from Source (For Developers)
If you want to modify the extension or build it yourself:
1. Clone this repository: `git clone https://github.com/kikotc/glat.git`
2. Install dependencies: `npm install` (Note: No extra esbuild matchers are required for standard compilation)
3. Press `F5` in VS Code to compile and launch the Extension Development Host.

---

*Built for the 2026 AI Developer Hackathon*