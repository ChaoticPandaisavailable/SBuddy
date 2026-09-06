# Aiping + MOSS 接入说明

这次沿用 feat/hackathon-showcase 的 React / Vinext / Sites 工程。前端继续调用同源 /api/ai/*，密钥只由服务端读取；学习数据、角色隔离和现有本地降级逻辑保持兼容。

## 本地启动与配置

在项目根目录保留自己的 .env.local，参考 .env.example 填写。不要覆盖已配置的文件。修改配置后重启 npm run dev，打开 http://localhost:3000/ 。演示空间 ?demo=1 的文字整理仍使用明确标注的本地规则；验证真实 AI 请进入个人空间。

| 用途 | 本站接口 | 服务与模型 |
| --- | --- | --- |
| 日程识别、纪要、课件、对话润色 | /api/ai/schedule、summary、courseware、dialogue | Aiping /chat/completions，Qwen3-Next-80B-A3B-Instruct |
| 课表/考试截图、照片人物分析、动作图校验 | /api/ai/campus-import、avatar、avatar-style | Aiping /chat/completions，Qwen3-VL-30B-A3B-Instruct |
| 照片生成像素人物 | /api/ai/avatar | Aiping /images/generations，Doubao-Seedream-5.0-lite |
| 上传录音、录音后转文字 | /api/ai/transcribe | MOSS /audio/transcriptions，moss-transcribe-1.0 |

Aiping 基础地址为 https://aiping.cn/api/v1；MOSS 为 https://api.mosi.cn/v1。模型可分别通过 AIPING_TEXT_MODEL、AIPING_VISION_MODEL、AIPING_IMAGE_MODEL、MOSS_TRANSCRIBE_MODEL 调整。换图像模型时必须支持当前 Seedream 请求格式，不能任意填入文字模型。

TRANSCRIBE_PROVIDER=moss 独立于 AI_PROVIDER=aiping；单独配置 MOSS 也能转写，不需要 OpenAI 或 Aiping 密钥。需要旧服务时显式设为 openai，并填写相应 OPENAI_* 字段。

## 请求兼容与失败处理

- 文字和图片理解采用 Chat Completions JSON 模式。服务端按各业务的 JSON Schema 检查字段、类型、枚举和长度；截断、无效 JSON 或缺字段会走现有失败/本地降级流程，不当作真实识别成功。
- 文字/视觉单次等待 60 秒；音频 180 秒；生图 240 秒。前端等待略长于对应请求；静态人物生成包括单人分析，前端最长等待 320 秒。
- MOSS 使用 multipart 的 file、model、response_format=json，读取 text。浏览器实时听写仍是浏览器语音识别；MOSS 对应“上传录音/转写这段录音”。
- 401/403、402、429 和超时显示可理解的提示。不会把上游返回的原始敏感错误内容发到页面。
- Vinext 当前版本会在路由分发前检查所有 multipart 请求；next.config.ts 将该预检上限设为 21 MB。业务仍限制照片 8 MiB、录音 20 MiB、课表截图 950 KiB。

## Seedream 特别适配

Seedream 5 的最低像素面积高于旧版 1536×2048 请求，因此使用 1920×2560，默认生成一个完整的静态人物。旧动画模式仍保留六列八行布局，每格 320×320。

实测 Aiping 在 response_format=b64_json 下会出现 HTTP 200 但 data=[]。当前使用 response_format=url 配合 extra_body.provider.enable_image_base64=true，读取返回的 b64_json（它可能已经带 data:image/png;base64 前缀）。若服务未返回图片，不自动追加计费重试，也不把临时 URL 当作保存完成。

Seedream 返回普通 RGB PNG，不能直接假设有透明通道。提示词要求洋红背景；服务端用 fast-png 解码，只去掉与外边界连通的饱和洋红背景，保留白衣、肤色和封闭的内部颜色，再编码为透明 PNG。静态图只检查可读取、有效人物范围及透明背景；旧动画模式另有动作帧校验。照片里若有大面积洋红服装，该方案可能影响还原，不能保证所有照片都一次成功。

角色页现在提交 mode=portrait，返回 rigVersion=4 单人静态图。生成后先显示预览，用户点击“应用静态人物”才写入发起生成的搭子；支持下载图片，保存失败会保留预览与原角色。静态图不依赖 48 帧动作一致性，仍可对话、增加默契、专注和使用手势。刷新及完整备份支持该外观；既有 V1–V3 动画保持兼容。预览尚未应用时仅存于当前页面内存，离开页面前可下载保存。

## 验证

npm run test:ai 为离线模拟测试，不读取真实密钥、不消费额度。覆盖请求格式、模型选择、MOSS 独立配置、错误脱敏、返回校验、旧 OpenAI 兼容及洋红背景处理。

npm run test:sbuddy、npm run test:campus、npm run lint、npx tsc --noEmit、npm run build 用于现有项目回归。

实际路由验证：对话、日程、课件、纪要与 MOSS 转写返回 source=ai；静态人物接口返回 HTTP 200、rigVersion=4、displayMode=static，真实 PNG 的透明背景与人物范围通过检查。旧 48 帧链路曾因动作一致性返回 invalid_rig，因此照片入口默认使用静态预览流程。

补充回归：npm run test:portrait 检查静态接口、角色隔离、外观恢复和人物边界；npm run test:gestures 检查游戏手势操作、无会话反馈及跨搭子专注保护。摄像头实际识别效果取决于设备、光线和权限，自动测试不代表真人手势识别成功。

真实调用仅使用本地测试素材，无用户个人照片或录音。素材保存在被忽略的 .qa/，不提交仓库。

## 配置保存范围

.env.local 已在 .gitignore 中；.env.example 只包含字段和模型名。密钥不放进 NEXT_PUBLIC_*、VITE_*、浏览器存储、备份或前端包。复制仓库到另一台电脑时需自行配置密钥；本次未配置云端或公开部署。

## 官方资料

- [Aiping 文本与多模态接口](https://aiping.cn/docs/API/text-models)
- [Aiping Seedream 参数](https://aiping.cn/docs/API/ImageAPI/VOLCENGINE_API_DOC)
- [Aiping 图片返回选项](https://aiping.cn/docs/API/ImageAPI/provider-scheduling)
- [MOSS 转写接口](https://platform.mosi.cn/docs/reference/transcriptions/)

