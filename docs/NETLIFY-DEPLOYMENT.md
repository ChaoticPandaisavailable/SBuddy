# Netlify 部署

正式地址：https://sbuddy-study.netlify.app

站点名称：`sbuddy-study`。正式部署及预览部署均公开访问，无需 Netlify 登录。

## 更新网站

在 `site` 目录运行：

```powershell
npx netlify-cli deploy --prod
```

当前目录已通过忽略的 `.netlify/state.json` 关联站点；换电脑时先运行 `npx netlify-cli link --name sbuddy-study`，并登录有权限的 Netlify 账号。

`netlify.toml` 指定 `npm run build:netlify` 和独立输出目录 `.netlify/static`。Netlify 专用的 Vite 配置使用 Nitro 生成服务函数，保留首页、清单、兼容跳转和 `/api/ai/*` 接口。原来的 Sites 配置及构建命令继续保留。

`NEXT_PUBLIC_SITE_ORIGIN` 在部署配置中设为正式域名，用于社交分享元数据。以后更改域名时应同步此配置并重新部署。

## 本次验证

2026-09-06：Netlify 构建完成，正式部署成功。检查首页、页面脚本与样式、人物和场景素材、手势模型与 WASM、应用清单、兼容跳转、日程识别接口。详细检查结果保存在忽略目录 `.qa/netlify-live-check.json`。

网站资源随部署提供；首页不依赖外部字体或脚本地址。国内不同地区和运营商的稳定性仍需在对应网络实际验证。

线上日程识别接口已返回识别结果。学习记录保存在各访客浏览器，域名变更后需要使用应用内的备份和恢复迁移原有记录。
