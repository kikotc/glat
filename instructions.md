# GLAT Change Card + Supabase Integration Prompt

You are helping build a **VS Code extension called GLAT (Global Local Agent Transport)**.

GLAT allows developers using AI coding agents (like GitHub Copilot) to share **structured context about uncommitted changes before commits**.

Your task is to implement the **change card generation pipeline and Supabase storage layer**.

Keep the implementation minimal and production‑like.

---

# SYSTEM OVERVIEW

GLAT works by converting local code changes into **Change Cards**.

A change card represents:
- what changed
- who changed it
- which files may be impacted

These cards are stored in **Supabase** so other developers can retrieve relevant context.

---

# WORKFLOW

## Broadcasting Changes

When a developer runs:

GLAT: Broadcast Local Changes

The extension should:

1. Detect changed files using git
2. Generate a change card
3. Store the card in Supabase

---

## Retrieving Context

When another developer runs:

GLAT: Prepare Context for Copilot

The extension should:

1. Detect the active file
2. Query Supabase for change cards impacting that file
3. Inject relevant summaries into a Copilot prompt

---

# CHANGE CARD STRUCTURE

Use the following schema:

```
{
  id: string
  author: string
  timestamp: string
  changed_files: string[]
  impacted_files: string[]
  summary: string
}
```

Example:

```
{
  "id": "uuid",
  "author": "kiko",
  "timestamp": "2026-03-14T19:00:00Z",
  "changed_files": ["backend/user.ts"],
  "impacted_files": ["frontend/UserCard.tsx"],
  "summary": "Backend user response field fullName was renamed to displayName"
}
```

---

# SUPABASE SETUP

Use Supabase as the backend database.

Create a table:

```
change_cards
```

Schema:

```
id uuid primary key
author text
timestamp timestamptz
changed_files jsonb
impacted_files jsonb
summary text
```

This allows fast querying of impacted files.

---

# SUPABASE CLIENT SETUP

Install Supabase client:

```
npm install @supabase/supabase-js
```

Initialize client:

```
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)
```

---

# BROADCAST COMMAND IMPLEMENTATION

Command ID:

```
glat.broadcastChanges
```

Steps:

1. Get workspace root

Use:

```
vscode.workspace.workspaceFolders
```

2. Run git command

```
git diff --name-only
```

Use Node:

```
child_process.exec
```

3. Parse changed files into array.

4. Generate impacted_files

For MVP:

```
impacted_files = changed_files
```

5. Create change card object.

Example:

```
const card = {
  id: crypto.randomUUID(),
  author: "developer",
  timestamp: new Date().toISOString(),
  changed_files: changedFiles,
  impacted_files: changedFiles,
  summary: "Local code changes detected"
}
```

6. Insert into Supabase.

```
await supabase
  .from("change_cards")
  .insert(card)
```

7. Notify the user.

```
vscode.window.showInformationMessage("GLAT change card broadcasted")
```

---

# RETRIEVAL COMMAND IMPLEMENTATION

Command ID:

```
glat.prepareContext
```

Steps:

1. Get active editor

```
const editor = vscode.window.activeTextEditor
```

2. Extract active file path

```
const activeFile = editor.document.fileName
```

3. Query Supabase for relevant change cards

```
const { data } = await supabase
  .from("change_cards")
  .select("*")
  .contains("impacted_files", [activeFile])
```

4. Ask the user for a prompt

```
vscode.window.showInputBox()
```

5. Build an augmented prompt.

Example:

```
Task:
${userPrompt}

Relevant teammate changes:
${cards.map(c => "- " + c.summary).join("\n")}

Current file:
${fileContents}
```

6. Open prompt in a new editor so the user can paste it into Copilot.

```
vscode.workspace.openTextDocument({
  content: prompt,
  language: "markdown"
})

vscode.window.showTextDocument(document)
```

---

# KEY DESIGN PRINCIPLES

Keep the system simple.

Do not implement:

- embeddings
- dependency graphs
- automatic Copilot integration
- complex indexing

Use only:

- git diff
- change cards
- Supabase storage
- file‑level retrieval

---

# SUCCESS CRITERIA

The feature works if:

1. A developer runs **GLAT Broadcast Local Changes**.
2. A change card is inserted into Supabase.
3. Another developer runs **GLAT Prepare Context for Copilot**.
4. Relevant change cards are retrieved.
5. The extension generates a prompt containing teammate change summaries.

---

# OPTIONAL IMPROVEMENTS (IF TIME PERMITS)

- AI‑generated change summaries
- AI prediction of impacted files
- symbol‑level indexing
- real‑time updates using Supabase subscriptions
