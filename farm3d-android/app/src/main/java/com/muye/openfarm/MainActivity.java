package com.muye.openfarm;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

/**
 * 牧野田园 · 安卓壳
 * <p>
 * 用官方 WebViewAssetLoader 把 assets 目录映射成 https 源：
 * https://appassets.androidplatform.net/assets/m.html
 * 这样页面拥有真实 origin，localStorage 存档才能可靠持久化
 * （直接用 file:// 加载时部分 WebView 会禁用 localStorage）。
 */
public class MainActivity extends Activity {

    private static final String TAG = "OpenFarm";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/m.html";

    /** 网页侧存盘点：pc 与移动端共用同一个 Game.save() */
    private static final String SAVE_JS =
            "(function(){try{if(window.FARM&&FARM.Game&&FARM.Game.save)FARM.Game.save();}catch(e){}})()";

    private ViewGroup root;
    private WebView web;
    private WebViewAssetLoader assetLoader;
    private long backPressedAt = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        root = findViewById(R.id.root);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = findViewById(R.id.web);
        config(web.getSettings());
        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new WebChromeClient());
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        if (web.getUrl() == null) {
            web.loadUrl(HOME);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void config(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // localStorage —— 存档核心
        s.setDatabaseEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        // 所有资源都经 https://appassets 的 WebViewAssetLoader 提供，不需要 file:// 能力。
        // 收紧后不影响资源加载，同时消除页面读取本地文件的可能（该设置自 API 30 起已废弃）。
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);                // 支持 viewport meta
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setDefaultTextEncodingName("utf-8");
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE); // 本地资源，避免更新后白屏
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }
    }

    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (HOST.equals(u.getHost())) return false;             // 站内资源
            String scheme = u.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) {  // 外链交给浏览器
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    Log.w(TAG, "open link failed", e);
                }
                return true;
            }
            return false;
        }

        @Override
        public void onReceivedError(WebView view, int code, String desc, String url) {
            Log.e(TAG, "load error " + code + " " + desc + " " + url);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Log.w(TAG, "webview render process gone, reloading");
            try {
                view.destroy();
            } catch (Exception ignored) {
            }
            root.removeAllViews();
            web = new WebView(MainActivity.this);
            web.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            config(web.getSettings());
            web.setWebViewClient(new LocalClient());
            web.setWebChromeClient(new WebChromeClient());
            root.addView(web);
            web.loadUrl(HOME);
            Toast.makeText(MainActivity.this, "页面已重新加载", Toast.LENGTH_SHORT).show();
            return true;
        }
    }

    /* ---------------- 生命周期 ---------------- */
    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.evaluateJavascript(SAVE_JS, null);   // 切后台先落盘
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.resumeTimers();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /* ---------------- 返回键：网页回退 / 双击退出 ---------------- */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - backPressedAt > 2000) {
            backPressedAt = now;
            Toast.makeText(this, "再按一次退出牧野田园", Toast.LENGTH_SHORT).show();
        } else {
            super.onBackPressed();
            finishAffinity();
        }
    }
}
