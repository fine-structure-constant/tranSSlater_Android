package com.transslater.app

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.URL
import java.util.concurrent.Executors

@InvokeArg
class TranslationRequest {
  lateinit var url: String
  var referer: String? = null
  // Legacy Rust payload field; Android must follow system routing for all hosts.
  var direct: Boolean = false
}

@TauriPlugin
class TranslationNetworkPlugin(activity: Activity) : Plugin(activity) {
  private val requests = Executors.newFixedThreadPool(3)

  @Command
  fun get(invoke: Invoke) {
    val args = invoke.parseArgs(TranslationRequest::class.java)
    requests.execute {
      val result = JSObject()
      var host = "翻译服务"
      try {
        val url = URL(args.url)
        host = url.host
        require(url.protocol == "https" && host in setOf("dict.youdao.com", "aidemo.youdao.com", "translate.googleapis.com")) { "不支持的翻译服务" }
        val response = NativeHttp.get(url, args.referer)
        result.put("status", response.status)
        result.put("body", response.body)
      } catch (error: Exception) {
        result.put("status", 0)
        result.put("body", "")
        result.put("error", NativeHttp.describe(error, host) + "\n连接详情：" + NativeHttp.details(error))
      }
      invoke.resolve(result)
    }
  }
}
