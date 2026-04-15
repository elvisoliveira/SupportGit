# SupportGit

Desktop app for browsing git refs, inspecting working tree changes, and creating commits from a local repository.

## Stack

- React 19 + Vite
- Tauri 2
- Rust backend commands for git operations
- Base UI / shadcn-style component wrappers

## Run

```bash
npm install
npm run dev
```

## Project Map

- `src/App.tsx`: top-level screen composition and app state
- `src/components/`: UI sections for the header, refs view, working tree, and commit tools
- `src/lib/git.ts`: frontend wrappers around Tauri commands
- `src/shared/types.ts`: shared TypeScript contracts used across the frontend
- `src-tauri/src/lib.rs`: Rust commands that run git and OpenAI requests
- `src-tauri/tauri.conf.json`: Tauri window and build configuration

## Main Flows

- `load_refs`: loads local branches, remote branches, and tags
- `load_status`: loads staged and unstaged file changes
- `checkout_ref`: switches to a branch or detaches to a tag
- `create_commit`: creates a commit from staged changes
- `generate_commit_message`: asks OpenAI for a commit message from the staged diff
