use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

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
            generate_branch_name
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
