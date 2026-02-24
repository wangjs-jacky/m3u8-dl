#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command as OsCommand;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter, Listener,
};
use tauri_plugin_shell::ShellExt;

static QUIT_FLAG: AtomicBool = AtomicBool::new(false);

// 缓存的 Deep Link 请求（用于应用启动时前端还未准备好的情况）
struct PendingDeepLink {
    url: String,
    output_path: Option<String>,
    referer: Option<String>,
    filename: Option<String>,
}

static PENDING_DEEP_LINK: Mutex<Option<PendingDeepLink>> = Mutex::new(None);

// 简单的 URL 解码函数
fn urlencoding_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    println!("reveal_in_finder called with path: {}", path);
    #[cfg(target_os = "macos")]
    {
        let output = OsCommand::new("open")
            .args(["-R", &path])
            .output()
            .map_err(|e| format!("Failed to execute open command: {}", e))?;
        println!("open command output: {:?}", output);
        if !output.status.success() {
            return Err(format!("open command failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(target_os = "windows")]
    {
        OsCommand::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        OsCommand::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 删除文件或目录
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    println!("delete_file called with path: {}", path);

    let path = std::path::Path::new(&path);

    if !path.exists() {
        println!("Path does not exist: {:?}", path);
        return Ok(()); // 文件不存在，视为成功
    }

    if path.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        std::fs::remove_file(path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    }

    println!("Successfully deleted: {:?}", path);
    Ok(())
}

// 获取并清除待处理的 Deep Link 请求
#[tauri::command]
fn get_pending_deep_link() -> Option<serde_json::Value> {
    let mut pending = PENDING_DEEP_LINK.lock().unwrap();
    if let Some(link) = pending.take() {
        println!("Returning pending deep link: {}", link.url);
        Some(serde_json::json!({
            "url": link.url,
            "output_path": link.output_path,
            "referer": link.referer,
            "filename": link.filename
        }))
    } else {
        None
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // 启动 Sidecar（设置环境变量避免代理问题）
            let shell = app.shell();
            let mut sidecar_command = shell
                .sidecar("m3u8-server")
                .expect("failed to create sidecar command");

            // 设置环境变量，禁用 localhost 请求的代理
            sidecar_command = sidecar_command.env("NO_PROXY", "localhost,127.0.0.1");

            let (mut rx, _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

            // 监听 Sidecar 输出（调试用）
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent::*;
                while let Some(event) = rx.recv().await {
                    match event {
                        Stdout(line) => println!("[Sidecar stdout] {}", String::from_utf8_lossy(&line)),
                        Stderr(line) => eprintln!("[Sidecar stderr] {}", String::from_utf8_lossy(&line)),
                        Error(err) => eprintln!("[Sidecar error] {}", err),
                        Terminated(payload) => {
                            println!("[Sidecar] terminated with code: {:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // 监听 deep-link 事件
            let app_handle = app.handle().clone();
            let _id = app.listen("deep-link", move |event| {
                let payload = event.payload();
                println!("Deep link received: {}", payload);

                // payload 是一个 JSON 字符串，包含 URL 数组
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload) {
                    for url_str in urls {
                        println!("Processing URL: {}", url_str);
                        // 简单解析 URL 参数
                        if url_str.starts_with("m3u8-downloader://download?") {
                            let query = &url_str["m3u8-downloader://download?".len()..];
                            let params: std::collections::HashMap<String, String> = query
                                .split('&')
                                .filter_map(|pair| {
                                    let mut parts = pair.splitn(2, '=');
                                    let key = parts.next()?.to_string();
                                    let value = parts.next().map(|v| {
                                        // 简单的 URL 解码
                                        urlencoding_decode(v)
                                    }).unwrap_or_default();
                                    Some((key, value))
                                })
                                .collect();

                            if let Some(video_url) = params.get("url") {
                                println!("Download request for: {}", video_url);

                                let pending_link = PendingDeepLink {
                                    url: video_url.clone(),
                                    output_path: params.get("output_path").cloned(),
                                    referer: params.get("referer").cloned(),
                                    filename: params.get("filename").cloned(),
                                };

                                // 缓存请求（用于前端初始化时查询）
                                {
                                    let mut pending = PENDING_DEEP_LINK.lock().unwrap();
                                    *pending = Some(pending_link);
                                }

                                // 尝试发送事件到前端（如果前端已准备好）
                                let _ = app_handle.emit("deep-link-download", serde_json::json!({
                                    "url": video_url,
                                    "output_path": params.get("output_path"),
                                    "referer": params.get("referer"),
                                    "filename": params.get("filename")
                                }));
                            }
                        }
                    }
                }
            });

            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "quit" => {
                        QUIT_FLAG.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 点击关闭按钮时最小化到托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUIT_FLAG.load(Ordering::SeqCst) {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![reveal_in_finder, delete_file, get_pending_deep_link])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
