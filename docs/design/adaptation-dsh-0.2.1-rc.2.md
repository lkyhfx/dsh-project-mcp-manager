# 适配记录：dsh v0.2.1-rc.2

[← 返回 README](../README.zh.md) ｜ 相关：[dsh 0.2.0-rc.2 适配记录](adaptation-dsh-0.2.0-rc.2.md) ·
[v0.9.0 发布说明](../releases/v0.9.0.md)

**记录日期**：2026-10-17 ｜ **插件**：`dsh-project-mcp-manager` v0.9.0
**宿主**：npm 上的 `@deepseek-ai/dsh@0.2.1-rc.2` 与标签 `dsh-v0.2.1-rc.2`
（`687f282`）。对照发布包 `@deepseek-ai/dsh-mcp-client@0.2.1-rc.2`、
`@deepseek-ai/cordis@4.0.5`（代码与 4.0.4 相同，只改了版本号）、
cordis-plugin-include `~1.0.10`、cordis-plugin-loader `~1.0.6`。
本次没有在本机 headless profile 里跑 `dsh`。

**结论**：官方仍然没有项目级 MCP 发现、按会话隔离和 `dsh-mcp` CLI。
v0.8.2 的 `^0.2.0-rc.2` 解析不到 `0.2.1-rc.2`，而新 client 的 cordis peer 是
`~4.0.5`，留在旧 client 上会和 0.2.1 宿主的 peer 对不上。v0.9.0 把依赖下限和
`engines.dsh` 抬到 `^0.2.1-rc.2`。client 桥接代码与 0.2.0-rc.2 的发布产物逐字节
相同，配置字段和传输集合没有新增。项目焦点继续读 `session.header.cwd`。

---

## 1. 发布包对照

`dsh-mcp-client` 0.2.0-rc.2 与 0.2.1-rc.2 的 `lib/` 哈希一致。变的是清单和说明：

| 点 | 0.2.0-rc.2 | 0.2.1-rc.2 |
|---|---|---|
| cordis peer | `~4.0.4` | `~4.0.5` |
| dsh peer | 精确 `0.2.0-rc.2`（tools、scope、timeout、attachment、llm、subprocess；resources 与 system-prompt 可选） | 精确 `0.2.1-rc.2`，可选 peer 不变 |
| 直接依赖 | MCP client SDK `2.0.0`、schemastery `~3.18.4`、`dsh-util-values@0.2.0-rc.2` | SDK `2.2.0`、schemastery `~3.18.5`、`dsh-util-values@0.2.1-rc.2` |
| `Client` 构造 | `versionNegotiation: { mode: "auto" }`，`listChanged.tools.autoRefresh: false` | 同一段代码 |
| 传输 / serverName / reconnect 上限 | `stdio` \| `streamable-http`，`[A-Za-z0-9_-]{1,32}`，`2147483647` | 未改。schema 的 `.max(MAX_TIMER_DELAY_MS)` 在 `lib/index.js` |
| `maxInstructionBytes` | 可选，缺省 32768 | 未改 |

SDK 2.2.0 仍从 `@modelcontextprotocol/client` 与 `./stdio` 导出桥接代码用到的
`Client`、`StreamableHTTPClientTransport`、`specTypeSchemas`、`StdioClientTransport`。
在已解析的 peer 树上加载 0.2.1-rc.2 的 `apply` 成功。

`@deepseek-ai/dsh-invariants@0.2.1-rc.2` 不在 registry。tools / agent / session /
renderer 去掉了 `./invariant` 伴生入口。本插件不引用它。

---

## 2. 对本插件有影响的宿主变更

| 点 | 0.2.0-rc.2 → 0.2.1-rc.2 | 处置 |
|---|---|---|
| 依赖范围 | `^0.2.0-rc.2` 解析不到 `0.2.1-rc.*` | 下限改为 `^0.2.1-rc.2`。0.2.0 用户留在 v0.8.2 |
| `engines.dsh` | 安装和 profile 启动优先读它；没有它才看 `@deepseek-ai/dsh*` peer。检查使用 `includePrerelease: true` | 两包声明 `^0.2.1-rc.2`。caret 上限是 `<0.3.0-0`，不会把 `0.3.0-rc.1` 放进来（`>=0.2.1-rc.2 <0.3.0` 会） |
| 工作目录 | `working-directory` 投影持有当前执行目录。`session.header.cwd` 仍是创建时的原始项目，提交 `working-directory/change` 不改 header | 发现、焦点、deny 继续读 `header.cwd`。`working_directory` 不挪 MCP 可见性 |
| `tools.restrict` / `schemas()` | 签名仍是 `{ allow?, deny? }` 与 `schemas(scope?)` | 不改调用 |
| 工具展示模式 | `ToolPresentationMode` 去掉 `both`，只留 `native` \| `ptc` | 本插件不设置该模式 |
| `agent/created` | 仍是 `{ agent, source, signal? }`，`list()` / `isOwnedBy` 仍在 | 现有监听成立 |
| `session/event` | `user/message` 仍在 | 切焦点的过滤条件不变 |
| 设置页 | `settings.plugins.tab`、`connection.fetch.register` 的入参形状、本页用到的 primitives 未改。精确 Fetch 路由只对 owner Peer 放行 | UI 仍注册原路由。浏览器 owner 走设置页 |
| `openNativeTextFile` | `dsh-native-command` 0.2.1-rc.2 与 0.2.0-rc.2 的包内容一致 | 不改调用 |
| cordis | 4.0.4 → 4.0.5，实现相同。include 1.0.9 → 1.0.10，loader 1.0.5 → 1.0.6 | 开发依赖 `^4.0.5` |

0.2.1-rc.1 → 0.2.1-rc.2 的发布说明是模型与网页搜索，没有 client 配置字段。

---

## 3. 验证

`pnpm test`（Node 22.23.3，预构建后的脚本）全绿：model 34、mcp-file 7、
json-file 13、json-write 6、registry 63、project-watch 5、cli 21、ui-collapse 14、
ui-paste 14、ui-display 7、panel-helpers、bundle 11、ui-lifecycle 11。

在 0.2.1-rc.2 client 的解析树上 `import` 得到 `apply` 函数，`MAX_TIMER_DELAY_MS`
为 `2147483647`。没有做 headless 实机装载。

---

## 4. 代码改动

- `package.json` / `packages/ui/package.json`：依赖与 `engines.dsh`，版本 0.9.0。
- `pnpm-workspace.yaml`：`minimumReleaseAgeExclude` 换到 `0.2.1-rc.2`，去掉
  已不存在的 `dsh-invariants`，补上 cordis 4.0.5、cosmokit 1.8.6、schemastery
  3.18.5、`dsh-credentials`、`dsh-fs`、`dsh-working-directory`。
- `src/model.ts`：传输集合注释改为 0.2.1-rc.2。值未改。
- `src/registry.ts`：写明焦点读的是原始项目，不跟随 working-directory。
