use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitRef {
    name: String,
    #[serde(rename = "type")]
    ref_type: String,
    sha: String,
    subject: String,
    checkout_name: String,
    local_name: Option<String>,
    remote_name: Option<String>,
    current: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadRefsResult {
    repo_path: String,
    refs: Vec<GitRef>,
}

#[derive(Debug, Serialize)]
struct CheckoutResult {
    head: String,
    detached: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoStatusFile {
    path: String,
    action_path: String,
    staged_code: String,
    unstaged_code: String,
    staged_label: String,
    unstaged_label: String,
    staged: bool,
    unstaged: bool,
    untracked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoStatusResult {
    staged: Vec<RepoStatusFile>,
    unstaged: Vec<RepoStatusFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitInput {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilePathInput {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBranchInput {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateCommitMessageInput {
    api_key: String,
    model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateCommitMessageResult {
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateBranchNameResult {
    branch_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupAndStageInput {
    api_key: String,
    model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GroupAndStageResult {
    message: String,
    rationale: String,
    hunk_count: usize,
    files: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AiHunkGroup {
    hunk_ids: Vec<String>,
    commit_message: String,
    rationale: String,
}

struct ParsedHunk {
    header_line: String,
    body_lines: Vec<String>,
}

struct ParsedFile {
    raw_header: String,
    path: String,
    hunks: Vec<ParsedHunk>,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        };

        Err(message)
    }
}

fn ensure_git_repo(repo_path: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["rev-parse", "--is-inside-work-tree"])?;
    if output == "true" {
        Ok(())
    } else {
        Err("Selected folder is not a git repository.".to_string())
    }
}

fn get_current_head(repo_path: &str) -> Result<(String, bool), String> {
    match run_git(repo_path, &["symbolic-ref", "--quiet", "--short", "HEAD"]) {
        Ok(head) => Ok((head, false)),
        Err(_) => {
            let head = run_git(repo_path, &["rev-parse", "--short", "HEAD"])?;
            Ok((head, true))
        }
    }
}

fn parse_ref_line(line: &str, ref_type: &str, current_head: &str) -> Option<GitRef> {
    if line.is_empty() {
        return None;
    }

    let mut parts = line.splitn(3, '\t');
    let name = parts.next()?.to_string();
    let sha = parts.next().unwrap_or_default().to_string();
    let subject = parts.next().unwrap_or_default().to_string();

    if ref_type == "remote" && name.ends_with("/HEAD") {
        return None;
    }

    let (remote_name, local_name) = if ref_type == "remote" {
        match name.split_once('/') {
            Some((remote, local)) => (Some(remote.to_string()), Some(local.to_string())),
            None => (None, Some(name.clone())),
        }
    } else {
        (None, None)
    };

    let current = current_head == name
        || (ref_type == "remote" && local_name.as_deref() == Some(current_head))
        || (ref_type == "tag" && current_head == name);

    Some(GitRef {
        checkout_name: name.clone(),
        name,
        ref_type: ref_type.to_string(),
        sha,
        subject,
        local_name,
        remote_name,
        current,
    })
}

fn list_refs(repo_path: &str, pattern: &str, ref_type: &str, current_head: &str) -> Result<Vec<GitRef>, String> {
    let output = run_git(
        repo_path,
        &[
            "for-each-ref",
            "--sort=refname",
            pattern,
            "--format=%(refname:short)\t%(objectname:short)\t%(contents:subject)",
        ],
    )?;

    if output.is_empty() {
        return Ok(Vec::new());
    }

    Ok(output
        .lines()
        .filter_map(|line| parse_ref_line(line, ref_type, current_head))
        .collect())
}

fn status_label(code: char, staged: bool) -> String {
    match code {
        'M' => "modified".to_string(),
        'A' => {
            if staged {
                "added".to_string()
            } else {
                "added?".to_string()
            }
        }
        'D' => "deleted".to_string(),
        'R' => "renamed".to_string(),
        'C' => "copied".to_string(),
        'U' => "updated".to_string(),
        '?' => "untracked".to_string(),
        _ => "clean".to_string(),
    }
}

fn run_git_bytes(repo_path: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;

    if output.status.success() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        };

        Err(message)
    }
}

fn parse_name_status_z(output: &[u8], staged: bool) -> Vec<RepoStatusFile> {
    let mut entries = Vec::new();
    let mut parts = output
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty());

    while let Some(status_part) = parts.next() {
        let Ok(status_text) = std::str::from_utf8(status_part) else {
            continue;
        };

        let code = status_text.chars().next().unwrap_or('?');
        let first_path = parts
            .next()
            .and_then(|part| std::str::from_utf8(part).ok())
            .unwrap_or_default();
        let action_path;
        let path = if matches!(code, 'R' | 'C') {
            let new_path = parts
                .next()
                .and_then(|part| std::str::from_utf8(part).ok())
                .unwrap_or_default();
            action_path = if new_path.is_empty() {
                first_path.to_string()
            } else {
                new_path.to_string()
            };
            if new_path.is_empty() {
                first_path.to_string()
            } else if first_path.is_empty() {
                new_path.to_string()
            } else {
                format!("{first_path} -> {new_path}")
            }
        } else {
            action_path = first_path.to_string();
            first_path.to_string()
        };

        if path.is_empty() {
            continue;
        }

        entries.push(RepoStatusFile {
            path,
            action_path,
            staged_code: if staged { code.to_string() } else { String::new() },
            unstaged_code: if staged { String::new() } else { code.to_string() },
            staged_label: if staged {
                status_label(code, true)
            } else {
                "clean".to_string()
            },
            unstaged_label: if staged {
                "clean".to_string()
            } else {
                status_label(code, false)
            },
            staged,
            unstaged: !staged,
            untracked: code == '?',
        });
    }

    entries
}

fn parse_untracked_z(output: &[u8]) -> Vec<RepoStatusFile> {
    output
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .filter_map(|part| std::str::from_utf8(part).ok())
        .map(|path| RepoStatusFile {
            path: path.to_string(),
            action_path: path.to_string(),
            staged_code: String::new(),
            unstaged_code: "?".to_string(),
            staged_label: "clean".to_string(),
            unstaged_label: "untracked".to_string(),
            staged: false,
            unstaged: true,
            untracked: true,
        })
        .collect()
}

fn staged_diff_context(repo_path: &str) -> Result<String, String> {
    let summary = run_git(
        repo_path,
        &["diff", "--cached", "--name-status", "--find-renames", "--find-copies"],
    )?;
    let diff = run_git(
        repo_path,
        &["diff", "--cached", "--no-color", "--unified=1", "--find-renames", "--find-copies"],
    )?;

    if summary.is_empty() || diff.is_empty() {
        return Err("There are no staged changes to summarize.".to_string());
    }

    const MAX_DIFF_CHARS: usize = 18_000;
    let truncated_diff: String = diff.chars().take(MAX_DIFF_CHARS).collect();

    Ok(format!(
        "Changed files:\n{summary}\n\nStaged diff:\n{truncated_diff}"
    ))
}

async fn generate_text_from_staged_diff(
    repo_path: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
) -> Result<String, String> {
    let diff_context = staged_diff_context(repo_path)?;
    let client = Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "input": [
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": system_prompt
                        }
                    ]
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": diff_context
                        }
                    ]
                }
            ]
        }))
        .send()
        .await
        .map_err(|error| format!("Failed to call OpenAI API: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unable to read error response.".to_string());
        return Err(format!("OpenAI API request failed ({status}): {body}"));
    }

    let response_json: Value = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse OpenAI response: {error}"))?;

    extract_response_text(&response_json)
        .map(|text| text.trim().to_string())
        .ok_or_else(|| "OpenAI response did not include message text.".to_string())
}

fn extract_response_text(response_json: &Value) -> Option<String> {
    let output = response_json.get("output")?.as_array()?;

    for item in output {
        if item.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }

        let content = item.get("content")?.as_array()?;
        let mut text_parts = Vec::new();

        for part in content {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    text_parts.push(trimmed.to_string());
                }
            }
        }

        if !text_parts.is_empty() {
            return Some(text_parts.join("\n"));
        }
    }

    None
}

fn parse_unified_diff(diff: &str) -> Vec<ParsedFile> {
    let mut files: Vec<ParsedFile> = Vec::new();
    let mut current_file: Option<ParsedFile> = None;
    let mut current_hunk: Option<ParsedHunk> = None;

    let flush_hunk =
        |current_hunk: &mut Option<ParsedHunk>, current_file: &mut Option<ParsedFile>| {
            if let (Some(hunk), Some(file)) = (current_hunk.take(), current_file.as_mut()) {
                file.hunks.push(hunk);
            }
        };

    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            flush_hunk(&mut current_hunk, &mut current_file);
            if let Some(file) = current_file.take() {
                files.push(file);
            }
            let path = extract_diff_path(rest);
            current_file = Some(ParsedFile {
                raw_header: format!("{line}\n"),
                path,
                hunks: Vec::new(),
            });
            continue;
        }

        if line.starts_with("@@ ") {
            flush_hunk(&mut current_hunk, &mut current_file);
            current_hunk = Some(ParsedHunk {
                header_line: line.to_string(),
                body_lines: Vec::new(),
            });
            continue;
        }

        if let Some(hunk) = current_hunk.as_mut() {
            hunk.body_lines.push(line.to_string());
        } else if let Some(file) = current_file.as_mut() {
            file.raw_header.push_str(line);
            file.raw_header.push('\n');
        }
    }

    flush_hunk(&mut current_hunk, &mut current_file);
    if let Some(file) = current_file.take() {
        files.push(file);
    }

    files
}

fn extract_diff_path(rest: &str) -> String {
    let parts: Vec<&str> = rest.split(' ').collect();
    if let Some(b_path) = parts.get(1) {
        if let Some(stripped) = b_path.strip_prefix("b/") {
            return stripped.to_string();
        }
        return b_path.to_string();
    }
    rest.to_string()
}

fn reassemble_patch(file: &ParsedFile, hunk_indices: &[usize]) -> String {
    let mut out = file.raw_header.clone();
    for &idx in hunk_indices {
        let hunk = &file.hunks[idx];
        out.push_str(&hunk.header_line);
        out.push('\n');
        for body_line in &hunk.body_lines {
            out.push_str(body_line);
            out.push('\n');
        }
    }
    out
}

fn apply_patch_cached(repo_path: &str, patch: &str) -> Result<(), String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("apply")
        .arg("--cached")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to spawn git apply: {error}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "git apply stdin unavailable".to_string())?;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|error| format!("Failed to write patch: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("git apply wait failed: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "git apply failed".to_string()
        } else {
            format!("git apply failed: {stderr}")
        };
        return Err(message);
    }

    Ok(())
}

fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        text.to_string()
    } else {
        let truncated: String = text.chars().take(max_chars).collect();
        format!("{truncated}\n... [truncated]")
    }
}

async fn ai_pick_hunk_group(
    api_key: &str,
    model: &str,
    prompt_text: &str,
) -> Result<AiHunkGroup, String> {
    let client = Client::new();
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["hunk_ids", "commit_message", "rationale"],
        "properties": {
            "hunk_ids": {
                "type": "array",
                "items": { "type": "string" }
            },
            "commit_message": { "type": "string" },
            "rationale": { "type": "string" }
        }
    });

    let payload = serde_json::json!({
        "model": model,
        "input": [
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": "You group hunks of a git diff. From the provided hunks, pick ONE coherent set that together form a single logical change (one feature, one fix, or one cohesive refactor). Keep interdependent hunks together (for example a new function and its call sites, or a helper and its usage). Never mix unrelated topics. If no coherent group exists, return an empty hunk_ids array. Write a concise imperative commit message for the chosen group (short subject, optional bullet body) and a one-sentence rationale."
                    }
                ]
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": prompt_text
                    }
                ]
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "hunk_group",
                "schema": schema,
                "strict": true
            }
        }
    });

    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Failed to call OpenAI API: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unable to read error response.".to_string());
        return Err(format!("OpenAI API request failed ({status}): {body}"));
    }

    let response_json: Value = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse OpenAI response: {error}"))?;

    let text = extract_response_text(&response_json)
        .ok_or_else(|| "OpenAI response did not include text.".to_string())?;

    serde_json::from_str::<AiHunkGroup>(text.trim())
        .map_err(|error| format!("Failed to parse AI JSON: {error} — raw: {text}"))
}

#[tauri::command]
fn load_refs(repo_path: String) -> Result<LoadRefsResult, String> {
    ensure_git_repo(&repo_path)?;

    let (head, detached) = get_current_head(&repo_path)?;
    let mut refs = Vec::new();

    refs.extend(list_refs(&repo_path, "refs/heads", "local", &head)?);
    refs.extend(list_refs(&repo_path, "refs/remotes", "remote", &head)?);
    refs.extend(list_refs(&repo_path, "refs/tags", "tag", &head)?);

    if detached {
        for reference in &mut refs {
            if reference.sha == head {
                reference.current = true;
            }
        }
    }

    Ok(LoadRefsResult { repo_path, refs })
}

#[tauri::command]
fn checkout_ref(repo_path: String, reference: GitRef) -> Result<CheckoutResult, String> {
    ensure_git_repo(&repo_path)?;

    match reference.ref_type.as_str() {
        "local" => {
            run_git(&repo_path, &["switch", &reference.name])?;
        }
        "remote" => {
            let local_name = reference
                .local_name
                .as_deref()
                .ok_or_else(|| "Remote branch metadata is incomplete.".to_string())?;

            let local_exists = run_git(&repo_path, &["branch", "--list", local_name])?;

            if local_exists.is_empty() {
                run_git(
                    &repo_path,
                    &["switch", "--track", "-c", local_name, &reference.name],
                )?;
            } else {
                run_git(&repo_path, &["switch", local_name])?;
            }
        }
        "tag" => {
            run_git(&repo_path, &["switch", "--detach", &reference.name])?;
        }
        _ => return Err("Unknown ref type.".to_string()),
    }

    let (head, detached) = get_current_head(&repo_path)?;
    Ok(CheckoutResult { head, detached })
}

#[tauri::command]
fn load_status(repo_path: String) -> Result<RepoStatusResult, String> {
    ensure_git_repo(&repo_path)?;
    let staged_output = run_git_bytes(
        &repo_path,
        &[
            "diff",
            "--cached",
            "--name-status",
            "-z",
            "--find-renames",
            "--find-copies",
        ],
    )?;
    let unstaged_output = run_git_bytes(
        &repo_path,
        &["diff", "--name-status", "-z", "--find-renames", "--find-copies"],
    )?;
    let untracked_output =
        run_git_bytes(&repo_path, &["ls-files", "--others", "--exclude-standard", "-z"])?;

    let staged = parse_name_status_z(&staged_output, true);
    let mut unstaged = parse_name_status_z(&unstaged_output, false);
    unstaged.extend(parse_untracked_z(&untracked_output));

    Ok(RepoStatusResult { staged, unstaged })
}

#[tauri::command]
fn stage_file(repo_path: String, input: FilePathInput) -> Result<(), String> {
    ensure_git_repo(&repo_path)?;

    let path = input.path.trim();
    if path.is_empty() {
        return Err("File path cannot be empty.".to_string());
    }

    run_git(&repo_path, &["add", "--", path])?;
    Ok(())
}

#[tauri::command]
fn stage_all_files(repo_path: String) -> Result<(), String> {
    ensure_git_repo(&repo_path)?;
    run_git(&repo_path, &["add", "--all"])?;
    Ok(())
}

#[tauri::command]
fn unstage_file(repo_path: String, input: FilePathInput) -> Result<(), String> {
    ensure_git_repo(&repo_path)?;

    let path = input.path.trim();
    if path.is_empty() {
        return Err("File path cannot be empty.".to_string());
    }

    run_git(&repo_path, &["reset", "HEAD", "--", path])?;
    Ok(())
}

#[tauri::command]
fn unstage_all_files(repo_path: String) -> Result<(), String> {
    ensure_git_repo(&repo_path)?;
    run_git(&repo_path, &["reset", "HEAD", "--", "."])?;
    Ok(())
}

#[tauri::command]
fn create_commit(repo_path: String, input: CommitInput) -> Result<CheckoutResult, String> {
    ensure_git_repo(&repo_path)?;

    let message = input.message.trim();
    if message.is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }

    let staged = run_git(&repo_path, &["diff", "--cached", "--name-only"])?;
    if staged.is_empty() {
        return Err("There are no staged changes to commit.".to_string());
    }

    run_git(&repo_path, &["commit", "-m", message])?;

    let (head, detached) = get_current_head(&repo_path)?;
    Ok(CheckoutResult { head, detached })
}

#[tauri::command]
fn create_branch(repo_path: String, input: CreateBranchInput) -> Result<CheckoutResult, String> {
    ensure_git_repo(&repo_path)?;

    let name = input.name.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }

    run_git(&repo_path, &["check-ref-format", "--branch", name])?;
    run_git(&repo_path, &["switch", "-c", name])?;

    let (head, detached) = get_current_head(&repo_path)?;
    Ok(CheckoutResult { head, detached })
}

#[tauri::command]
async fn generate_commit_message(
    repo_path: String,
    input: GenerateCommitMessageInput,
) -> Result<GenerateCommitMessageResult, String> {
    ensure_git_repo(&repo_path)?;

    let api_key = input.api_key.trim();
    if api_key.is_empty() {
        return Err("OpenAI API key is required.".to_string());
    }

    let model = input.model.trim();
    if model.is_empty() {
        return Err("OpenAI model is required.".to_string());
    }

    let message = generate_text_from_staged_diff(
        &repo_path,
        api_key,
        model,
        "Write a concise git commit message for staged changes. Return plain text only. Use imperative mood. Prefer a short subject line. Add a blank line and bullet list only when the change clearly needs extra detail.",
    )
    .await?;

    Ok(GenerateCommitMessageResult {
        message,
    })
}

#[tauri::command]
async fn generate_branch_name(
    repo_path: String,
    input: GenerateCommitMessageInput,
) -> Result<GenerateBranchNameResult, String> {
    ensure_git_repo(&repo_path)?;

    let api_key = input.api_key.trim();
    if api_key.is_empty() {
        return Err("OpenAI API key is required.".to_string());
    }

    let model = input.model.trim();
    if model.is_empty() {
        return Err("OpenAI model is required.".to_string());
    }

    let branch_name = generate_text_from_staged_diff(
        &repo_path,
        api_key,
        model,
        "Write one git branch name for the staged changes. Return plain text only. Use lowercase kebab-case or slash-separated git branch format such as feature/add-search-filter or fix/status-panel. Do not include explanations, quotes, prefixes like 'branch:', or multiple options.",
    )
    .await?;

    Ok(GenerateBranchNameResult { branch_name })
}

#[tauri::command]
async fn group_and_stage_unstaged(
    repo_path: String,
    input: GroupAndStageInput,
) -> Result<GroupAndStageResult, String> {
    ensure_git_repo(&repo_path)?;

    let api_key = input.api_key.trim();
    if api_key.is_empty() {
        return Err("OpenAI API key is required.".to_string());
    }

    let model = input.model.trim();
    if model.is_empty() {
        return Err("OpenAI model is required.".to_string());
    }

    let diff_bytes = run_git_bytes(
        &repo_path,
        &["diff", "--no-color", "--no-ext-diff", "--unified=3"],
    )?;
    let diff = String::from_utf8(diff_bytes)
        .map_err(|error| format!("Unstaged diff is not valid UTF-8: {error}"))?;

    if diff.trim().is_empty() {
        return Err("No unstaged changes to group.".to_string());
    }

    let files = parse_unified_diff(&diff);

    const MAX_HUNK_CHARS: usize = 2_000;
    const MAX_PROMPT_CHARS: usize = 40_000;

    let mut catalog: Vec<(String, usize, usize)> = Vec::new();
    let mut prompt_sections: Vec<String> = Vec::new();

    for (file_idx, file) in files.iter().enumerate() {
        for (hunk_idx, hunk) in file.hunks.iter().enumerate() {
            let id = format!("{file_idx}:{hunk_idx}");
            let body = hunk.body_lines.join("\n");
            let summary = format!(
                "--- hunk {id} ({path}) ---\n{header}\n{body}",
                id = id,
                path = file.path,
                header = hunk.header_line,
                body = truncate_text(&body, MAX_HUNK_CHARS),
            );
            catalog.push((id, file_idx, hunk_idx));
            prompt_sections.push(summary);
        }
    }

    if catalog.is_empty() {
        return Err("No text hunks were found in the unstaged diff.".to_string());
    }

    let joined = prompt_sections.join("\n\n");
    let prompt_text = truncate_text(&joined, MAX_PROMPT_CHARS);

    let group = ai_pick_hunk_group(api_key, model, &prompt_text).await?;

    if group.hunk_ids.is_empty() {
        return Err("AI could not identify a coherent hunk group.".to_string());
    }

    let mut per_file: std::collections::BTreeMap<usize, Vec<usize>> =
        std::collections::BTreeMap::new();
    for id in &group.hunk_ids {
        let entry = catalog
            .iter()
            .find(|(catalog_id, _, _)| catalog_id == id)
            .ok_or_else(|| format!("AI returned unknown hunk id: {id}"))?;
        per_file.entry(entry.1).or_default().push(entry.2);
    }

    let mut applied_files: Vec<String> = Vec::new();
    for (file_idx, mut hunk_indices) in per_file {
        hunk_indices.sort_unstable();
        hunk_indices.dedup();
        let patch = reassemble_patch(&files[file_idx], &hunk_indices);
        apply_patch_cached(&repo_path, &patch)?;
        applied_files.push(files[file_idx].path.clone());
    }

    Ok(GroupAndStageResult {
        message: group.commit_message,
        rationale: group.rationale,
        hunk_count: group.hunk_ids.len(),
        files: applied_files,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_refs,
            checkout_ref,
            load_status,
            stage_file,
            stage_all_files,
            unstage_file,
            unstage_all_files,
            create_branch,
            create_commit,
            generate_commit_message,
            generate_branch_name,
            group_and_stage_unstaged
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
