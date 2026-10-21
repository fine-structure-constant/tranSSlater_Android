//! Android owns incoming selection/share intents; Rust exposes a one-shot drain.
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
pub struct ExternalInput {
    pub text: Option<String>,
    pub error: Option<String>,
}

#[cfg(target_os = "android")]
struct NativeInput(tauri::plugin::PluginHandle<tauri::Wry>);

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("external-input")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("com.transslater.app", "ExternalInputPlugin")?;
                _app.manage(NativeInput(handle));
            }
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn take_external_input(_app: tauri::AppHandle) -> Result<ExternalInput, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        return _app.state::<NativeInput>().inner().0
            .run_mobile_plugin("take", ())
            .map_err(|error| format!("接收外部文字失败：{error}"));
    }
    #[cfg(not(target_os = "android"))]
    Ok(ExternalInput::default())
}
