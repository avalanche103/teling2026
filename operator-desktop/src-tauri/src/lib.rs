use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, UserAttentionType, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

const WINDOW_LABEL: &str = "main";
const DEFAULT_URL: &str = "https://teling.by/login?client=desktop";

fn operator_start_url() -> String {
    std::env::var("TELING_OPERATOR_URL").unwrap_or_else(|_| DEFAULT_URL.to_string())
}

fn is_allowed_navigation(url: &tauri::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    let host_ok = matches!(
        host,
        "teling.by" | "www.teling.by" | "localhost" | "127.0.0.1"
    );
    if !host_ok {
        return false;
    }

    let path = url.path();
    path == "/login"
        || path.starts_with("/operator")
        || path.starts_with("/api/")
        || path.starts_with("/_next/")
        || path.starts_with("/images/")
        || path == "/teling-circle.webp"
        || path == "/favicon.ico"
        || path == "/favicon-32.png"
        || path == "/apple-touch-icon.png"
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.hide();
    }
}

#[tauri::command]
fn focus_operator_window(app: AppHandle) {
    show_main_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_hidden = std::env::args().any(|arg| arg == "--hidden");
    let start_url = operator_start_url();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden".into()]),
        ))
        .invoke_handler(tauri::generate_handler![focus_operator_window])
        .setup(move |app| {
            let parsed = start_url
                .parse::<tauri::Url>()
                .unwrap_or_else(|_| DEFAULT_URL.parse().expect("default url"));

            let init_script = r#"
              (function () {
                function isAsset(path) {
                  return (
                    path.startsWith('/_next/') ||
                    path.startsWith('/api/') ||
                    path.startsWith('/images/') ||
                    /\.(webp|png|ico|svg|js|css|woff2?)$/i.test(path)
                  );
                }
                function allowed(path) {
                  return path === '/login' || path.startsWith('/operator') || isAsset(path);
                }
                function guard() {
                  if (!allowed(location.pathname)) {
                    location.replace('/operator/chat');
                  }
                }
                function invokeFocus() {
                  try {
                    var api = window.__TAURI__;
                    if (api && api.core && typeof api.core.invoke === 'function') {
                      return api.core.invoke('focus_operator_window');
                    }
                  } catch (_) {}
                  return Promise.resolve();
                }
                window.__TELING_DESKTOP__ = {
                  focus: invokeFocus
                };
                window.addEventListener('teling-desktop-focus', function () {
                  invokeFocus();
                });
                guard();
                document.addEventListener('click', function (event) {
                  var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
                  if (!a) return;
                  try {
                    var url = new URL(a.href, location.href);
                    if (url.origin === location.origin && !allowed(url.pathname)) {
                      event.preventDefault();
                      location.replace('/operator/chat');
                    }
                  } catch (_) {}
                }, true);
              })();
            "#;

            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(parsed))
                .title("Teling Чат")
                .inner_size(1200.0, 800.0)
                .min_inner_size(1000.0, 700.0)
                .resizable(true)
                .initialization_script(init_script)
                .on_navigation(|url| is_allowed_navigation(url))
                .build()?;

            let show_i = MenuItem::with_id(app, "show", "Открыть", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Скрыть", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app icon").clone())
                .tooltip("Teling Чат")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let autostart = app.autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
            }

            if start_hidden {
                hide_main_window(app.handle());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
