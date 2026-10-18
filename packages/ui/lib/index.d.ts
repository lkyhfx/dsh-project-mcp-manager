import type { Context } from "@deepseek-ai/cordis";
export declare const name = "dsh-project-mcp-ui";
/** projectMcp 是硬依赖；connection 在子作用域里等待，headless 下 UI 行仍可 active。 */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
