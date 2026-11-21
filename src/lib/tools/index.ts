import { registerTool } from "./registry";
import { registerDocumentTools } from "./documents";
import "./apple";
import "./personal";
import "./personal-data";

let registered = false;

export function registerAllTools() {
  if (registered) return;
  registered = true;
  registerDocumentTools();
}

registerAllTools();

export { listTools, getTool, runTool, toolsForPrompt, saveArtifact } from "./registry";
export type { ToolResult, ToolDef, ToolContext } from "./registry";
export { sendNotification } from "./personal";
export { registerTool };
