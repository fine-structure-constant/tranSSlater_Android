//! Keep response parsing in Rust; use Android's DNS, TLS and VPN aware HTTP stack.
use super::error::TranslateError;
use serde_json::Value;

pub struct Response {
    pub status: u16,
    pub body: String,
}

impl Response {
    pub fn json(self) -> Result<Value, TranslateError> {
        serde_json::from_str(&self.body)
            .map_err(|_| TranslateError::Parse("服务未返回有效数据，请稍后重试".into()))
    }
}

#[cfg(target_os = "android")]
static NATIVE: std::sync::OnceLock<tauri::plugin::PluginHandle<tauri::Wry>> = std::sync::OnceLock::new();

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("translation-network")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin("com.transslater.app", "TranslationNetworkPlugin")?;
                let _ = NATIVE.set(handle);
            }
            Ok(())
        }).build()
}

/// Explicit proxy configurations retain reqwest's SOCKS/auth support. Otherwise
/// native requests follow the phone's network and system trust configuration.
pub async fn send(
    client: &reqwest::Client,
    request: reqwest::RequestBuilder,
    _direct: bool,
    _explicit_proxy: bool,
) -> Result<Response, TranslateError> {
    let request = request.build()?;
    #[cfg(target_os = "android")]
    if !_explicit_proxy {
        #[derive(serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct NativeRequest {
            url: String,
            referer: Option<String>,
            direct: bool,
        }
        #[derive(serde::Deserialize)]
        struct NativeResponse {
            status: u16,
            body: String,
            error: Option<String>,
        }
        let native = NATIVE.get().ok_or_else(|| TranslateError::Network("手机网络通道尚未就绪，请重新打开应用".into()))?;
        let response: NativeResponse = native.run_mobile_plugin_async("get", NativeRequest {
            url: request.url().to_string(),
            referer: request.headers().get("referer").and_then(|s| s.to_str().ok()).map(str::to_owned),
            direct: _direct,
        }).await.map_err(|_| TranslateError::Network("手机网络通道未响应，请重新打开应用".into()))?;
        if let Some(error) = response.error { return Err(TranslateError::Network(error)); }
        return Ok(Response { status: response.status, body: response.body });
    }
    let response = client.execute(request).await?;
    Ok(Response { status: response.status().as_u16(), body: response.text().await? })
}
